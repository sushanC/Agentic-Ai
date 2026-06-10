import { exec } from "child_process";

export function speak(text) {

  return new Promise(
    (resolve, reject) => {

      exec(
        `python3 tts.py "${text.replace(/"/g, "")}"`,

        err => {

          if (err) {

            reject(err);

            return;
          }

          exec(
            "ffplay -nodisp -autoexit speech.mp3",

            err => {

              if (err) {

                reject(err);

              } else {

                resolve();
              }
            }
          );
        }
      );
    }
  );
}