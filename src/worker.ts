/**
 * All console.log for debugging the worker on cloudflare dashboard
 */

import { completeGPT3 } from "./helpers/chatGPT";
import { createIssue } from "./helpers/github";
import { onPrivateCallbackQuery } from "./helpers/navigation";
import { getBotUsername, handleSlashCommand, isAdminOfChat, isBotAdded, isBotRemoved } from "./helpers/telegram";
import { answerCallbackQuery, apiUrl, deleteBotMessage, editBotMessage, sendReply } from "./helpers/triggers";
import {
  cleanMessage,
  isCooldownReady,
  setLastAnalysisTimestamp,
  escapeMarkdown,
  extractTag,
  extractTaskInfo,
  generateMessageLink,
  getRepoData,
  removeTag,
  slashCommandCheck,
} from "./helpers/utils";
import { CallbackQueryType, ExtendableEventType, FetchEventType, MessageType, MyChatQueryType, UpdateType } from "./types/Basic";

/**
 * Wait for requests to the worker
 */
addEventListener("fetch", async (event: Event) => {
  const ev = event as FetchEventType;
  const url = new URL(ev.request.url);
  if (url.pathname === WEBHOOK) {
    await ev.respondWith(handleWebhook(ev as ExtendableEventType));
  } else if (url.pathname === "/registerWebhook") {
    await ev.respondWith(registerWebhook(url, WEBHOOK || "", SECRET || ""));
  } else if (url.pathname === "/unRegisterWebhook") {
    await ev.respondWith(unRegisterWebhook());
  } else {
    await ev.respondWith(new Response("No handler for this request"));
  }
});

/**
 * Handle requests to WEBHOOK
 * https://core.telegram.org/bots/api#update
 */
const handleWebhook = async (event: ExtendableEventType) => {
  // Check secret
  if (event.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Read request body synchronously
  const update = await event.request.json();
  // Deal with response asynchronously
  event.waitUntil(onUpdate(update));

  return new Response("Ok");
};

/**
 * Handle incoming Update
 * supports messages and callback queries (inline button presses)
 * https://core.telegram.org/bots/api#update
 */
const onUpdate = async (update: UpdateType) => {
  console.log(update)
  if ("message" in update || "channel_post" in update) {
    try {
      await onMessage(update.message || update.channel_post);
    } catch (e) {
      console.log(e);
    }
  }

  if ("callback_query" in update) {
    const isPrivate = update.callback_query.message.chat.type === "private";
    if (isPrivate) {
      await onPrivateCallbackQuery(update.callback_query);
    } else {
      await onCallbackQuery(update.callback_query);
    }
  }

  if ("my_chat_member" in update) {
    // queries to run on installation and removal
    await onBotInstall(update.my_chat_member);
  }
};

/**
 * Set webhook to this worker's url
 * https://core.telegram.org/bots/api#setwebhook
 */
const registerWebhook = async (requestUrl: URL, suffix: string, secret: string) => {
  // https://core.telegram.org/bots/api#setwebhook
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
  const r = await (await fetch(apiUrl("setWebhook", { url: webhookUrl, secret_token: secret }))).json();
  return new Response("ok" in r && r.ok ? "Ok" : JSON.stringify(r, null, 2));
};

/**
 * Remove webhook
 * https://core.telegram.org/bots/api#setwebhook
 */
const unRegisterWebhook = async () => {
  const r = await (await fetch(apiUrl("setWebhook", { url: "" }))).json();
  return new Response("ok" in r && r.ok ? "Ok" : JSON.stringify(r, null, 2));
};

const onBotInstall = async (event: MyChatQueryType) => {
  const status = event.new_chat_member.status;
  const triggerUserName = event.new_chat_member.user.username;
  const chatId = event.chat.id;
  const fromId = event.from.id;
  const groupName = event.chat.title;

  const botName = await getBotUsername();

  console.log(status, chatId, fromId, groupName);

  if (botName === triggerUserName) {
    // true if this is a valid bot install and uninstall
    switch (status) {
      case "kicked":
        await isBotRemoved(chatId, fromId);
        break;
      case "left":
        await isBotRemoved(chatId, fromId);
        break;
      case "member":
        await isBotAdded(chatId, fromId, groupName);
        break;
      case "added":
        await isBotAdded(chatId, fromId, groupName);
        break;
      case "administrator":
        await isBotAdded(chatId, fromId, groupName);
        break;
      default:
        break;
    }
  }
};

/**
 * Handle incoming callback_query (inline button press)
 * https://core.telegram.org/bots/api#message
 */
async function onCallbackQuery(callbackQuery: CallbackQueryType) {
  const clickerId = callbackQuery.from.id; // Username of user who clicked the button
  const groupId = callbackQuery.message.chat.id; // group id
  const messageId = callbackQuery.message.message_id; // id for current message
  const messageIdReply = callbackQuery.message.reply_to_message.message_id; // id of root message
  //const senderId = message.from.id
  const messageText = callbackQuery.message.text; // text of current message
  const replyToMessage = callbackQuery.message.reply_to_message.text; // text of root message

  //  only admin can approve task
  const isAdmin = await isAdminOfChat(clickerId, groupId);
  if(!isAdmin) {
    return answerCallbackQuery(callbackQuery.id, "You're not allowed to create task, Admins only");
  }

  if (callbackQuery.data === "create_task") {
    // get message link
    const messageLink = generateMessageLink(messageIdReply, groupId);

    const { title, timeEstimate } = extractTaskInfo(messageText);

    if (title === null || timeEstimate === null) {
      console.log(`Task title is null`);
      return;
    }

    const { repoName, orgName } = await getRepoData(groupId);

    console.log(`Check: ${title}, ${timeEstimate} ${orgName}:${repoName}`);

    if (!repoName || !orgName) {
      console.log(`No Github data mapped to channel`);
      return;
    }

    // get tagged user if available
    const tagged = extractTag(replyToMessage);

    // remove tag from issue body
    const tagFreeTitle = removeTag(replyToMessage);

    const { data, assignees, error } = await createIssue(timeEstimate || "", orgName, repoName, title || "", tagFreeTitle, messageLink, tagged || "");

    console.log(`Issue created: ${data.html_url} ${data.message}`);

    const msg = data.html_url
      ? `*Issue created: [Check it out here](${data.html_url})* with time estimate *${timeEstimate}*${assignees ? ` and @${tagged} as assignee` : ""}`
      : `Error creating issue on *${orgName}/${repoName}*, Details: *${error || data.message}*`;

    await editBotMessage(groupId, messageId, msg);
    return answerCallbackQuery(callbackQuery.id, "issue created!");
  } else if (callbackQuery.data === "reject_task") {
    await deleteBotMessage(groupId, messageId);
  }
}

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
const onMessage = async (message: MessageType) => {
  console.log(message)
  console.log(`Received message: ${message.text}`);

  if (!message.text) {
    console.log(`Skipping, no message attached`);
    return;
  }

  // HANDLE SLASH HANDLERS HERE
  const isSlash = slashCommandCheck(message.text);
  const isPrivate = message.chat.type === "private";

  if (isPrivate) {
    // run prvate messages
    const chatId = message.chat.id; // chat id
    const fromId = message.from.id; // get caller id
    return handleSlashCommand(isSlash, message.text, fromId, chatId);
  }

  if (isSlash) return;

  // Check if cooldown
  const isReady = isCooldownReady();

  if (!isReady) {
    console.log(`Skipping, bot on cooldown`);
    return;
  }

  const msgText = cleanMessage(message.text);

  if (msgText === "") {
    console.log(`Skipping, message is empty`);
    console.log(message);
    return;
  }

  // Analyze the message with ChatGPT
  const GPT3Info = await completeGPT3(msgText);

  if (GPT3Info == undefined || GPT3Info.issueTitle == null) {
    console.log(`No valid task found`);
    return;
  }

  const { issueTitle, timeEstimate } = GPT3Info;

  // Update the last analysis timestamp upon successful analysis
  setLastAnalysisTimestamp(Date.now());

  const groupId = message.chat.id; // group id
  const messageId = message.message_id;

  const { repoName, orgName } = await getRepoData(groupId);

  if (!repoName || !orgName) {
    console.log(`No Github data mapped to channel`);
    return sendReply(
      groupId,
      messageId,
      escapeMarkdown(`No Github mapped to this channel, please use the /start command in private chat to set this up`, "*`[]()@/"),
      true
    );
  }

  if (issueTitle) {
    return sendReply(groupId, messageId, escapeMarkdown(`*"${issueTitle}"* on *${orgName}/${repoName}* with time estimate *${timeEstimate}*`, "*`[]()@/"));
  }
};
