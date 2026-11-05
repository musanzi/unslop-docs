# Store documents outside public uploads

The starter serves its uploads directory publicly, which conflicts with private student documents. Store documents in a separate persistent volume and serve downloads through owner-checked API endpoints. Admin privileges allow user management but do not grant access to another user's document contents.

The first release uses one server instead of object storage. Adding more servers will require shared document storage or a storage migration.
