import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs";
import { Readable } from "stream";

export const readEnvironmentFile = async () => {
  try {
    const environmentData = JSON.parse(fs.readFileSync("environment.json", "utf8"));
    const keys = Object.keys(environmentData);

    for (const key of keys) {
      const value = environmentData[key];
      const command = `echo '${value}' | wrangler secret put ${key.toUpperCase()}`;

      console.log(`Running command: ${command}`);
      const secretCommand = spawn(command, { shell: true, stdio: "pipe" });

      // Promisify child process events
      const onData = waitForEvent(secretCommand.stdout, "data");
      const onError = waitForEvent(secretCommand.stderr, "data");
      const onClose = waitForEvent(secretCommand, "close");

      // Wait for stdout, stderr, and close events
      await Promise.all([onData, onError, onClose]);

      // Continue the loop after each command is finished
      console.log(`Command for "${key}" completed.`);
    }
  } catch (err) {
    console.error("Error reading or executing commands:", err);
  }
};

export const waitForEvent = (emitter: Readable | ChildProcessWithoutNullStreams, event: string) => {
  return new Promise((resolve) => {
    emitter.on(event, (data) => {
      console.log(data.toString());
    });
    emitter.once("error", (error) => {
      console.error(error.toString());
    });
    emitter.once("close", (code: number) => {
      resolve(code);
    });
  });
};

void readEnvironmentFile();
