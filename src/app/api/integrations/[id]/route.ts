import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
  getBankCredentialMeta,
  getRequiresManualTwoFactor,
  setRequiresManualTwoFactor,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
import { setCredentialPartner, getPartnerById } from "@/server/db/queries/partners";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function parseCredentialId(id: string): number | null {
  const credentialId = Number(id);
  if (!Number.isFinite(credentialId) || credentialId <= 0) return null;
  return credentialId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const meta = getBankCredentialMeta(workspaceId, credentialId);
  if (!meta) {
    return NextResponse.json({
      credentials: null,
      label: null,
      provider: null,
      requiresManualTwoFactor: false,
      hasTwoFactorToken: false,
    });
  }

  const credentials = getBankCredentials(workspaceId, credentialId);
  if (!credentials) {
    return NextResponse.json({
      credentials: null,
      label: meta.label,
      provider: meta.provider,
      requiresManualTwoFactor: false,
      hasTwoFactorToken: false,
    });
  }

  const { otpLongTermToken, ...userFacing } = credentials;

  return NextResponse.json({
    credentials: userFacing,
    label: meta.label,
    provider: meta.provider,
    requiresManualTwoFactor: getRequiresManualTwoFactor(
      workspaceId,
      credentialId
    ),
    hasTwoFactorToken: Boolean(otpLongTermToken),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  if (!getBankCredentialMeta(workspaceId, credentialId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: {
    requiresManualTwoFactor?: boolean;
    resetTwoFactorToken?: boolean;
    partnerId?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (typeof body.requiresManualTwoFactor === "boolean") {
    setRequiresManualTwoFactor(
      workspaceId,
      credentialId,
      body.requiresManualTwoFactor
    );
  }
  if (body.resetTwoFactorToken === true) {
    updateCredentialField(
      workspaceId,
      credentialId,
      "otpLongTermToken",
      null
    );
  }
  if ("partnerId" in body) {
    const pid = body.partnerId;
    if (pid !== null && pid !== undefined) {
      // C2: reject zero and negative ids (auto-increment starts at 1)
      if (!Number.isFinite(pid) || pid <= 0) {
        return NextResponse.json({ error: "invalid partnerId" }, { status: 400 });
      }
      // C1: ensure the partner belongs to the same workspace as the credential
      if (!getPartnerById(workspaceId, pid)) {
        return NextResponse.json({ error: "partner not found" }, { status: 404 });
      }
    }
    // C4: setCredentialPartner returns false if the credential was deleted in a
    // race between the existence check above and this write.
    const updated = setCredentialPartner(workspaceId, credentialId, pid ?? null);
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  deleteBankCredentials(workspaceId, credentialId);
  return NextResponse.json({ success: true });
}
