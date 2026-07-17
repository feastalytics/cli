import { errorMessage } from "./auth";
import { runCli } from "./main";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
