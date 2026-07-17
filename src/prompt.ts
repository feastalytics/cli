import readline from "readline";

export function promptText(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    const rlAny = rl as any;
    let muted = false;
    rlAny._writeToOutput = (text: string) => {
      if (!muted) {
        rlAny.output.write(text);
        return;
      }
      if (text.includes("\n")) {
        rlAny.output.write("\n");
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

export async function promptConfirm(question: string): Promise<boolean> {
  const answer = await promptText(`${question} [y/N] `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}
