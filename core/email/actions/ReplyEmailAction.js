import { SendEmailAction } from "./SendEmailAction.js";

/**
 * ReplyEmailAction.js
 *
 * Action handler extension point for replying to existing emails.
 */
export class ReplyEmailAction {
  static async execute(params, provider) {
    const subject = params.subject && !params.subject.toLowerCase().startsWith("re:")
      ? `Re: ${params.subject}`
      : params.subject;

    return await SendEmailAction.execute({ ...params, subject }, provider);
  }
}
