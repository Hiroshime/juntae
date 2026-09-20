import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import { AppError } from "@/server/errors";

export type SmtpMessage = {
  host: string;
  port: 465 | 587;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
};

function publicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  const [a, b, c] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
    return false;
  return true;
}

export function isPublicSmtpAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return publicIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0];
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("::ffff:") ||
    firstGroup < 0x2000 ||
    firstGroup > 0x3fff
  )
    return false;
  return true;
}

async function resolvePublicHost(host: string) {
  if (isIP(host))
    throw new AppError(
      "Use o hostname público do provedor SMTP, não um endereço IP.",
      400,
      "UNSAFE_SMTP_HOST",
    );
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError(
      "Não foi possível localizar o servidor SMTP informado.",
      400,
      "SMTP_DNS_FAILED",
    );
  }
  if (!addresses.length || addresses.some((entry) => !isPublicSmtpAddress(entry.address)))
    throw new AppError(
      "O servidor SMTP precisa apontar somente para endereços públicos.",
      400,
      "UNSAFE_SMTP_HOST",
    );
  return addresses[0].address;
}

export function classifyEmailError(error: unknown) {
  if (error instanceof AppError) return error.code;
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
  switch (code) {
    case "EAUTH":
      return "SMTP_AUTHENTICATION_FAILED";
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
      return "SMTP_CONNECTION_FAILED";
    case "EENVELOPE":
      return "SMTP_RECIPIENT_REJECTED";
    case "EMESSAGE":
      return "SMTP_MESSAGE_REJECTED";
    default:
      return "SMTP_SEND_FAILED";
  }
}

export async function sendSmtpMessage(message: SmtpMessage) {
  const address = await resolvePublicHost(message.host);
  const transport = nodemailer.createTransport({
    host: address,
    port: message.port,
    secure: message.secure,
    requireTLS: !message.secure,
    auth: { user: message.username, pass: message.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: {
      servername: message.host,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  });
  try {
    await transport.sendMail({
      from: { name: message.fromName, address: message.fromEmail },
      replyTo: message.replyTo ?? undefined,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}
