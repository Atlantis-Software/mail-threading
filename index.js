// example usage:
// thread = mail.messageThread().thread(messages.map(
//   function(message) {
//     return mail.message(message.subject, message.messageId, message.references);
//   }
// ));
// conversation = thread.getConversation(messageId);
var _ = require('lodash');

var Container = require('./container');
var Thread = require('./thread');
var Message = require('./message');
var helpers = require('./helpers');
var Crud = require('./Crud');

var mail = module.exports = function() {
  this.conversation = new Crud();
  this.container = new Crud();
};

mail.prototype.message = Message;

mail.prototype.messageContainer = function(message, cb) {
  if (_.isFunction(message) && _.isUndefined(cb)) {
    cb = message;
    message = void 0;
  }
  if (!_.isFunction(cb)) {
    throw new Error('Usage: messageContainer([message,] cb) => cb must be a function.');
  }

  var self = this;
  var cnt = {};
  if (message) {
    cnt.message = message.id;
  }
  self.container._create(cnt, function(err, cnt) {
    if (err) {
      return cb(err);
    }
    var new_ctn = new Container(cnt, self);
    if (message) {
      new_ctn.message = message;
    } else {
      return cb(null, new_ctn);
    }
    self.conversation._create({messageId: message.messageId, container: cnt.id}, function(err) {
      if (err) {
        return cb(err);
      }
      cb(null, new_ctn);
    });
  });
};

mail.prototype.messageThread = function() {
  return new Thread(this);
};

mail.prototype.helpers = helpers;
