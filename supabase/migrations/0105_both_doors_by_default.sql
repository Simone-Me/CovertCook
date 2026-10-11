-- A new dinner admits both a code and invitations unless the host says
-- otherwise. The client already sends CODE_AND_INVITE from every way of
-- creating a dinner; this keeps the column's own default saying the same, so
-- a dinner created any other way does not quietly start with one door shut.
alter table rounds alter column access set default 'CODE_AND_INVITE';
