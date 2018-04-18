var asynk = require('asynk');
var _ = require('lodash');

var Message = module.exports = function(id, subject, messageId, references) {
  if (_.isUndefined(id)) {
    throw new Error('Usage: Message.constructor(id, subject, messageId, references) => id must be an integer');
  }
  return {
    id: id,
    subject: subject,
    messageId: messageId,
    references: references
  };
};