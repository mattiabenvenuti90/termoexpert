import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrganization } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { encryptJson, decryptJson } from "@/modules/fluida-sync/server/crypto";

type SettingsPayload = {
  apiUrl?: string;
  authMethod?: "apikey" | "oauth";
  apiKeyHeader?: string;
  companyId?: string | null;
  apiKey?: string;
  oauthToken?: string;
  windowDays?: number;
};

function normalizeAuthMethod(value?: string) {
  return value === "oauth" ? "oauth" : "apikey";
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const org = await requireOrganization(request, auth.userId);
  if (!org.ok) return org.response;

  const settings = await prisma.fluidaIntegrationSettings.findUnique({
    where: { organizationId: org.organizationId },
  });

  const syncState = await prisma.stampingSyncState.findUnique({
    where: { organizationId: org.organizationId },
  });

  if (!settings) {
    return NextResponse.json({
      settings: null,
      windowDays: syncState?.windowDays ?? 14,
    });
  }

  const secrets = decryptJson({
    ciphertext: settings.encryptedData,
    iv: settings.iv,
    authTag: settings.authTag,
  }) as { apiKey?: string; oauthToken?: string };

  return NextResponse.json({
    settings: {
      apiUrl: settings.apiUrl,
      authMethod: settings.authMethod,
      apiKeyHeader: settings.apiKeyHeader,
      companyId: settings.companyId,
      hasApiKey: Boolean(secrets.apiKey),
      hasOauthToken: Boolean(secrets.oauthToken),
    },
    windowDays: syncState?.windowDays ?? 14,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const org = await requireOrganization(request, auth.userId);
  if (!org.ok) return org.response;

  let body: SettingsPayload = {};
  try {
    body = (await request.json()) as SettingsPayload;
  } catch {
    body = {};
  }

  if (!body.apiUrl) {
    return NextResponse.json({ error: "apiUrl required" }, { status: 400 });
  }

  const existing = await prisma.fluidaIntegrationSettings.findUnique({
    where: { organizationId: org.organizationId },
  });

  let secrets: { apiKey?: string; oauthToken?: string } = {};
  if (existing) {
    secrets = decryptJson({
      ciphertext: existing.encryptedData,
      iv: existing.iv,
      authTag: existing.authTag,
    }) as { apiKey?: string; oauthToken?: string };
  }

  if (body.apiKey) secrets.apiKey = body.apiKey;
  if (body.oauthToken) secrets.oauthToken = body.oauthToken;

  const encrypted = encryptJson(secrets);

  const saved = await prisma.fluidaIntegrationSettings.upsert({
    where: { organizationId: org.organizationId },
    create: {
      organizationId: org.organizationId,
      apiUrl: body.apiUrl,
      authMethod: normalizeAuthMethod(body.authMethod),
      apiKeyHeader: body.apiKeyHeader || "x-fluida-app-uuid",
      companyId: body.companyId || null,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
    update: {
      apiUrl: body.apiUrl,
      authMethod: normalizeAuthMethod(body.authMethod),
      apiKeyHeader: body.apiKeyHeader || "x-fluida-app-uuid",
      companyId: body.companyId || null,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
  });

  const windowDays = body.windowDays;
  if (windowDays) {
    await prisma.stampingSyncState.upsert({
      where: { organizationId: org.organizationId },
      create: {
        organizationId: org.organizationId,
        companyId: saved.companyId,
        windowDays,
      },
      update: {
        companyId: saved.companyId,
        windowDays,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
