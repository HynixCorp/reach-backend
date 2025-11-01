import { config } from "dotenv";
import { Resend } from "resend";

// Load env vars once when module is imported
config();

/**
 * Singleton service wrapper around the Resend client.
 * Use `resendService` (default export) or `ResendService.getInstance()` to obtain
 * the single shared instance so the underlying client isn't initialized more than once.
 */
export class ResendService {
  private static _instance: ResendService | null = null;
  private resendClient: Resend;

  // Make constructor private so callers must use getInstance()
  private constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        "Resend API key is not defined in environment variables. Please set RESEND_API_KEY."
      );
    }

    this.resendClient = new Resend(process.env.RESEND_API_KEY as string);
  }

  public static getInstance(): ResendService {
    if (!ResendService._instance) {
      ResendService._instance = new ResendService();
    }

    return ResendService._instance;
  }

  public getClient(): Resend {
    return this.resendClient;
  }

  public async sendEmail(
    to: string | string[],
    subject: string,
    body: string
  ): Promise<void> {
    if (!to || !subject || !body) {
      throw new Error("Missing required parameters to send email.");
    }

    try {
      await this.resendClient.emails.send({
        from: "ReachX <payments@service.reachx.dev>",
        to,
        subject,
        html: body,
      });
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email");
    }
  }
}

// Default export: shared singleton instance
export const resendService = ResendService.getInstance();
export default resendService;
