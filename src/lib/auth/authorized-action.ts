import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { PermissionDeniedError, requirePermission, type Permission } from "@/lib/permissions";

import { requireActionUser } from "./current-user";
import type { SessionUser } from "./session";

const forbidden: ActionFailure = { ok: false, error: "errors.forbiddenAction" };

/**
 * Defines a server action that identifies the user and checks the permission before its
 * arguments are looked at (docs/ПРАВА-ДОСТУПА.md, 1). A PermissionDeniedError thrown later in
 * the body, for a permission that depends on the submitted data, is refused the same way.
 * A refusal is a result rather than an exception: the role may have changed since the page
 * was rendered, and that should not end on the error page.
 */
export function authorizedAction<TArgs extends unknown[], TResult extends ActionResult>(
  permission: Permission,
  action: (actor: SessionUser, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ActionFailure> {
  return async (...args) => {
    const actor = await requireActionUser();
    try {
      requirePermission(actor, permission);
      return await action(actor, ...args);
    } catch (error) {
      if (error instanceof PermissionDeniedError) return forbidden;
      throw error;
    }
  };
}
