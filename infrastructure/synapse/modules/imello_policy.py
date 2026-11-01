"""
iMello policy module for Synapse.

Enforces iMello's closed-network and child-safety rules *on the homeserver*,
so a modified or malicious client cannot bypass them:

  * invites are only allowed between accounts the iMello policy service says
    may communicate (accepted contacts, guardian <-> child);
  * a child can only join rooms they were invited to, and never a room that
    contains someone they are not permitted to talk to;
  * nobody can join a room that contains a child unless permitted;
  * rooms can never be published to the public room directory;
  * user-directory searches return nothing (no stranger discovery).

The module FAILS CLOSED: if the policy service is unreachable or returns an
unexpected response, the action is denied.

No message content is ever sent to the policy service - only user IDs, the
room ID and the room's member list.
"""

import logging
from typing import Any, Dict, List, Literal, Union

from synapse.module_api import ModuleApi, NOT_SPAM, errors

logger = logging.getLogger(__name__)

Decision = Union[Literal["NOT_SPAM"], errors.Codes]


class ImelloPolicy:
    def __init__(self, config: Dict[str, Any], api: ModuleApi):
        self._api = api
        self._base = config["policy_url"].rstrip("/")
        self._secret = config["policy_secret"]
        api.register_spam_checker_callbacks(
            user_may_invite=self.user_may_invite,
            user_may_join_room=self.user_may_join_room,
            user_may_publish_room=self.user_may_publish_room,
            user_may_send_3pid_invite=self.user_may_send_3pid_invite,
            check_username_for_spam=self.check_username_for_spam,
        )

    @staticmethod
    def parse_config(config: Dict[str, Any]) -> Dict[str, Any]:
        for key in ("policy_url", "policy_secret"):
            if not config.get(key):
                raise Exception(f"imello_policy: '{key}' is required")
        if len(config["policy_secret"]) < 32:
            raise Exception("imello_policy: 'policy_secret' must be at least 32 characters")
        return config

    async def _members(self, room_id: str) -> List[str]:
        state = await self._api.get_room_state(room_id, [("m.room.member", None)])
        return [
            key[1]
            for key, event in state.items()
            if event.content.get("membership") in ("join", "invite")
        ]

    async def _ask(self, path: str, body: Dict[str, Any]) -> bool:
        try:
            result = await self._api.http_client.post_json_get_json(
                f"{self._base}{path}",
                body,
                headers={"x-imello-policy-secret": [self._secret]},
            )
        except Exception as e:  # network error, 4xx/5xx, bad JSON: deny.
            logger.warning("imello_policy: policy service error on %s (%s); denying", path, type(e).__name__)
            return False
        allowed = isinstance(result, dict) and result.get("allow") is True
        if not allowed:
            logger.info("imello_policy: %s denied (%s)", path, result.get("reason") if isinstance(result, dict) else "?")
        return allowed

    async def user_may_invite(self, inviter: str, invitee: str, room_id: str) -> Decision:
        members = await self._members(room_id)
        ok = await self._ask(
            "/internal/policy/invite",
            {"inviter": inviter, "invitee": invitee, "roomId": room_id, "roomMembers": members},
        )
        return NOT_SPAM if ok else errors.Codes.FORBIDDEN

    async def user_may_join_room(self, user: str, room_id: str, is_invited: bool) -> Decision:
        members = await self._members(room_id)
        # The room creator joining their own brand-new room: nobody else is there yet.
        if not members:
            return NOT_SPAM
        ok = await self._ask(
            "/internal/policy/join",
            {"userId": user, "roomId": room_id, "isInvited": is_invited, "roomMembers": members},
        )
        return NOT_SPAM if ok else errors.Codes.FORBIDDEN

    async def user_may_publish_room(self, user_id: str, room_id: str) -> Decision:
        return errors.Codes.FORBIDDEN

    async def user_may_send_3pid_invite(self, inviter: str, medium: str, address: str, room_id: str) -> Decision:
        return errors.Codes.FORBIDDEN

    async def check_username_for_spam(self, user_profile: Dict[str, Any], requester_id: str = "") -> bool:
        # Returning True hides the user from directory search results. iMello has no
        # stranger discovery: contacts are only added through private invites.
        return True
