import { errorMessage } from "./auth";
import { runCli } from "./main";
import { notifyIfOutdated } from "./updateNotifier";

runCli(process.argv.slice(2))
  .catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  })
  .then(() => notifyIfOutdated())
  .catch(() => undefined);
