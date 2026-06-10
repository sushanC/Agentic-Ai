import recorder from
  "node-record-lpcm16";

import fs from "fs";

import {
  exec
} from "child_process";

export async function listen() {

  return new Promise(
    resolve => {

      const file =
        fs.createWriteStream(
          "audio.wav"
        );

      const recording =
        recorder.record({

          sampleRate: 16000,

          threshold: 0,

          verbose: false
        });

      recording.stream()
        .pipe(file);

      console.log(
        "\n🎤 Speak now...\n"
      );

      setTimeout(
        () => {

          recording.stop();

          exec(
            "python speech_to_text.py audio.wav",

            (
              err,
              stdout
            ) => {

              if (err) {

                console.error(
                  err
                );

                resolve("");

                return;
              }

              resolve(
                stdout.trim()
              );
            }
          );

        },

        5000
      );
    }
  );
}