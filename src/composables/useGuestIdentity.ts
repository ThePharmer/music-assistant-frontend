/**
 * Shared composable for the party guest identity.
 * Registers a server-signed guest identity (party/register_guest) and
 * persists it in localStorage so queue items can be attributed to this
 * guest across page reloads. The signature is minted server-side; the
 * client only stores and echoes it back with guest actions.
 */

import { ref } from "vue";
import api from "@/plugins/api";

export interface GuestIdentity {
  guest_id: string;
  guest_sig: string;
  display_name: string;
}

const STORAGE_KEY = "mass_party_guest_identity";

const identity = ref<GuestIdentity | null>(loadStoredIdentity());

let registerPromise: Promise<GuestIdentity | null> | null = null;

function loadStoredIdentity(): GuestIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestIdentity;
    if (parsed.guest_id && parsed.guest_sig && parsed.display_name) {
      return parsed;
    }
  } catch {
    // Corrupt storage: fall through to unregistered state
  }
  return null;
}

/**
 * Register (or re-register with a new name) and persist the identity.
 * Returns null when registration fails; guest actions then proceed
 * unattributed, matching stock frontend behavior.
 */
async function register(displayName: string): Promise<GuestIdentity | null> {
  try {
    const result = (await api.sendCommand("party/register_guest", {
      display_name: displayName,
    })) as GuestIdentity;
    identity.value = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("Failed to register guest identity:", error);
    return null;
  }
}

/**
 * Ensure a registered identity exists, auto-generating a display name
 * on first use. Concurrent calls share a single registration request.
 */
async function ensureIdentity(): Promise<GuestIdentity | null> {
  if (identity.value) return identity.value;
  if (!registerPromise) {
    const generatedName = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
    registerPromise = register(generatedName).finally(() => {
      registerPromise = null;
    });
  }
  return registerPromise;
}

/**
 * Identity fields to spread into guest command payloads for attribution.
 * Empty when no identity is registered (commands still work unattributed).
 */
function identityParams(): Record<string, string> {
  if (!identity.value) return {};
  return {
    guest_id: identity.value.guest_id,
    guest_name: identity.value.display_name,
    guest_sig: identity.value.guest_sig,
  };
}

export function useGuestIdentity() {
  return {
    identity,
    register,
    ensureIdentity,
    identityParams,
  };
}
