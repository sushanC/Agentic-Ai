import { SendEmailAction } from "./SendEmailAction.js";

/**
 * ForwardEmailAction.js
 *
 * Action handler extension point for forwarding existing emails.
 */
export class ForwardEmailAction {
  static async execute(params, provider) {
    const subject = params.subject && !params.subject.toLowerCase().startsWith("fwd:")
      ? `Fwd: ${params.subject}`
      : params.subject;

    return await SendEmailAction.execute({ ...params, subject }, provider);
  }
}
