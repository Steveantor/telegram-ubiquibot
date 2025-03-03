import { removeNewlinesAndExtractValues } from "./utils";
import { PROMPT, TRAINING } from "./prompt";
import { ErrorType } from "../types/Basic";

export const completeGPT3 = async (messageText: string) => {
  try {
    const apiKey = OPENAI_API_KEY;
    const apiUrl = "https://api.openai.com/v1/chat/completions";

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: TRAINING,
        },
        {
          role: "user",
          content: PROMPT.replace(/{messageText}/g, messageText),
        },
      ],
      max_tokens: 1500,
      temperature: 0,
      stream: false,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    console.log(data); // log raw data

    if (data?.error) {
      console.log(`ChatGPT Error: ${data?.error}`);
      return;
    }

    return removeNewlinesAndExtractValues(data.choices[0].message.content);
  } catch (e) {
    console.log((e as ErrorType).message);
    return {
      issueTitle: null,
      timeEstimate: null,
    };
  }
};

export default {
  completeGPT3,
};
