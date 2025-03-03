import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const addTelegramBot = async (chatId: number, fromId: number, groupName: string) => {
  try {
    const { data, error } = await supabase.from("telegram_bot_groups").select().eq("from_id", fromId).eq("id", chatId);

    if (data && data.length > 0) {
      const { github_repo, key, created_at } = data[0].id;
      await supabase.from("telegram_bot_groups").upsert({
        id: key,
        group_name: groupName,
        from_id: fromId,
        github_repo: github_repo,
        updated_at: new Date().toUTCString(),
        created_at: created_at,
      });
    } else if ((data && data.length === 0) || error) {
      await supabase.from("telegram_bot_groups").insert({
        id: chatId,
        group_name: groupName,
        from_id: fromId,
        github_repo: "",
        created_at: new Date().toUTCString(),
        updated_at: new Date().toUTCString(),
      });
    }
  } catch (error) {
    console.log(error);
  }
};

export const getTelegramBotByFromId = async (fromId: number) => {
  try {
    const { data, error } = await supabase.from("telegram_bot_groups").select().eq("from_id", fromId);

    return { data, error };
  } catch (error) {
    console.log(error);
  }
};

export const removeTelegramBot = async (chatId: number, fromId: number) => {
  try {
    const { data, error } = await supabase.from("telegram_bot_groups").delete().eq("id", chatId).eq("from_id", fromId);

    return { data, error };
  } catch (error) {
    console.log(error);
  }
};

export const linkGithubRepoToTelegram = async (fromId: number, chatId: number, github_repo: string) => {
  try {
    const { data, error } = await supabase.from("telegram_bot_groups").select().eq("from_id", fromId).eq("id", chatId);
    if (data && data.length > 0) {
      const { group_name, from_id, id } = data[0];
      await supabase.from("telegram_bot_groups").upsert({
        id,
        group_name,
        from_id,
        github_repo,
        updated_at: new Date().toUTCString(),
      });
    } else if (error) {
      console.log("Error adding github_repo to supabase");
    }
  } catch (error) {
    console.log(error);
  }
};

export const getRepoByGroupId = async (groupId: number) => {
  try {
    const { data, error } = await supabase.from("telegram_bot_groups").select("github_repo").eq("id", groupId);
    if (data && data.length > 0) {
      return data[0]?.github_repo;
    } else if (error) {
      console.log("Error adding github_repo to supabase");
      return "";
    }
  } catch (error) {
    console.log(error);
    return "";
  }
};
