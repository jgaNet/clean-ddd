# 3. Invite by a link, and join

A group grows by a link someone shares in a chat.

- **An invitation.** Any member of a group creates an invitation to it. The invitation's id is what the link carries: whoever has it may join, so it is long and impossible to guess. One invitation may be used by any number of people, and stays usable.
- **Reading it.** A signed-in person who has the link reads the invitation before joining: the group's id and name, and who invited them. They need not be a member to read it; that is what the link is for.
- **Joining.** A signed-in person accepts the invitation and becomes a member of the group, with the same rights as every member but the owner. Someone who is already a member of the group cannot join it again: that is refused.
- **The members.** A member lists the group's members: each one's account id, name, role (`owner` or `member`) and when they joined, in the order they joined, the earliest first. The owner, who created the group, is first.
- **My groups.** A group someone joined is among their groups (request 2), at its place in the order.
- **Who sees what.** Only a member creates an invitation or lists the members. To anyone else, the group still does not exist.

The API works as request 1 says.

## The API

| Request                                    | Answer                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/invitations`         | creates the invitation, `{ id }`                                                                         |
| `GET /v1/invitations/{id}`                 | `200 { id, groupId, groupName, invitedBy }`, `invitedBy` the account id of the member who created it    |
| `POST /v1/invitations/{id}/accept`         | the caller joins the group                                                                               |
| `GET /v1/groups/{id}/members`              | `200 [ { memberId, name, role, joinedAt } ]`, in the order they joined, the earliest first             |
