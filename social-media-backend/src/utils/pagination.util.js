const mongoose = require('mongoose');

/**
 * Encode a MongoDB document's { createdAt, _id } into a base64 cursor string.
 * @param {{ createdAt: Date, _id: mongoose.Types.ObjectId }} doc
 * @returns {string}
 */
const encodeCursor = (doc) => {
  const raw = JSON.stringify({ createdAt: doc.createdAt.toISOString(), _id: doc._id.toString() });
  return Buffer.from(raw).toString('base64');
};

/**
 * Decode a base64 cursor string back into { createdAt, _id }.
 * Returns null if invalid.
 * @param {string} cursor
 * @returns {{ createdAt: Date, _id: mongoose.Types.ObjectId }|null}
 */
const decodeCursor = (cursor) => {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    return {
      createdAt: new Date(parsed.createdAt),
      _id: new mongoose.Types.ObjectId(parsed._id),
    };
  } catch {
    return null;
  }
};

/**
 * Build a MongoDB query object for cursor-based pagination on (createdAt DESC, _id DESC).
 * Returns {} (no cursor constraint) when cursor is not provided.
 * @param {string|undefined} cursor  base64-encoded cursor
 * @returns {object}
 */
const buildCursorQuery = (cursor) => {
  if (!cursor) return {};

  const decoded = decodeCursor(cursor);
  if (!decoded) return {};

  const { createdAt, _id } = decoded;

  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      { createdAt, _id: { $lt: _id } },
    ],
  };
};

module.exports = { encodeCursor, decodeCursor, buildCursorQuery };
