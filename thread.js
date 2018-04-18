var asynk = require('asynk');
var _ = require('lodash');

var Container = require('./container');
var helpers = require('./helpers');

var Thread = module.exports = function(context) {
  this.idTable = {};
  this.ContainerCache = {};
  this.context = context;
  this.container = context.container;
  this.conversation = context.conversation;
};

Thread.prototype.thread = function(messages, cb) {
  if (!messages || !cb) {
    throw new Error('Usage: thread(messages, cb)');
  }
  this.idTable = {};
  this.ContainerCache = {};
  var self = this;

  this.createIdTable(messages, function(err, idTable) {
    if (err) {
      return cb(err);
    }
    self.ContainerCache[0] = new Container({id: 0}, self.context);
    asynk.each(_.keys(idTable), function (id, cb) {
      self.getContainer(id, function (err, container) {
        if (err) {
          return cb(err);
        }
        if (_.isUndefined(container.parent)) {
          return self.ContainerCache[0].addChild(container, cb);
        }
        cb();
      });
    }).serie().done(function () {
      self.pruneEmpties(self.ContainerCache[0], function (err) {
        if (err) {
          return cb(err);
        }
        cb(null, self.ContainerCache[0]);
      });
    }).fail(cb);
  });
};

Thread.prototype.insert = function(message, cb) {
  var self = this;
  this.thread(message, function(err, root) {
    if (err) {
      return cb(err);
    }
    cb(null, self.idTable[message.messageId]);
  });
}

Thread.prototype.pruneEmpties = function(parent, cb) {
  if (!cb) {
    throw new Error('Usage: pruneEmpties(parent, cb)');
  }
  if (!parent) {
    return cb();
  }
  if (parent.children.length === 0) {
    return cb();
  }
  var self = this;
  asynk.each(parent.children, function(container, cb) {
    self.pruneEmpties(container, function(err) {
      if (err) {
        return cb(err);
      }
      // container is not empty
      if (container.message) {
        return cb();
      }

      // container has no child so remove it
      if (container.children.length === 0) {
        return parent.removeChild(container, cb);
      }
      
      // if parent is root and container has more than one child do nothing
      if (!parent.parent && container.children.length > 1) {
        return cb();
      }
      self.promoteChildren(parent, container, cb);

    });      
  }).serie().fail(cb).done(function() {
    cb(); 
  });
};

Thread.prototype.promoteChildren = function(parent, container, cb) {
  if (!cb) {
    throw new Error('Usage: promoteChildren(parent, container, cb)');
  }
  if (! parent instanceof Container) {
    throw new Error('Usage: promoteChildren(parent, container, cb) => parent must be an instance of Container');
  }
  if (! container instanceof Container) {
    throw new Error('Usage: promoteChildren(parent, container, cb) => container must be an instance of Container');
  }
  asynk.each(container.children, function(child, cb) {
    parent.addChild(child, cb);
  }).serie().done(function() { 
    parent.removeChild(container, cb);
  }).fail(cb);
};

Thread.prototype.createIdTable = function(messages, cb) {
  if (!cb) {
    throw new Error('Usage: createIdTable(messages, cb)');
  }
  if (!_.isArray(messages)) {
    messages = [messages];
  }
  this.idTable = {};
  var self = this;
  asynk.each(messages, function(message, cb) {
    self.getContainer(message.messageId, function(err, parentContainer) {
      if (err) {
        return cb(err);
      }
      parentContainer.setMessage(message, function(err) {
        if (err) {
          return cb(err);
        }
        var prev = null;
        var prevMessageId = null;
        var references = message.references || [];
        if (typeof (references) === 'string') {
          references = [references];
        }

        asynk.each(references, function(reference, cb) {
          self.getContainer(reference, function(err, container) {
            if (err) {
              return cb(err);
            }
            container.hasDescendant(prev, function(err, hasDescendant) {
              if (err) {
                return cb(err);
              }
              if (prev && _.isUndefined(container.parent) && !hasDescendant) {
                return prev.addChild(container, function(err) {
                  if (err) {
                    return cb(err);
                  }
                  prev = container;
                  prevMessageId = reference;
                  cb();
                });
              } 
              prev = container;
              prevMessageId = reference;
              cb();                
            });
          });
        }).serie().done(function() {
          parentContainer.hasDescendant(prev, function(err, hasDescendant) {
            if (err) {
              return cb(err);
            }
            if (prev && !hasDescendant) {
              return prev.addChild(parentContainer, cb);
            }
            cb();              
          });
        }).fail(function(err) {
          cb(err);
        });
      });
    });
  }).serie().fail(cb).done(function() { cb(null, self.idTable); });
  // return idTable;
};

Thread.prototype.getContainer = function(messageId, cb) {
  if (!cb) {
    throw new Error('Usage: getContainer(id, cb)');
  }
  if (this.idTable[messageId]) {
    return cb(null, this.idTable[messageId]);
  }
  var self = this;
  self.conversation._read({messageId: messageId}, function(err, conversation) {
    if (err) {
      return cb(err);
    }
    if (conversation && conversation.container && conversation.container.id) {
      var ctn = new Container(conversation.container, self.context);
      self.ContainerCache[conversation.container.id] = self.idTable[messageId] = ctn;
      ctn.load(self.ContainerCache, cb);
    } else {
      self.createContainer(messageId, cb);
    }
  });
};

Thread.prototype.createContainer = function(id, cb) {
  if (!cb) {
    throw new Error('Usage: createContainer(id, cb)');
  }
  var self = this;
  self.container._create({}, function(err, cnt) {
    if (err) {
      return cb(err);
    }
    self.conversation._create({messageId: id, container: cnt.id}, function(err, conversation) {
      if (err) {
        return cb(err);
      }
      ctn = new Container(cnt, self.context);
      self.ContainerCache[cnt.id] = self.idTable[id] = ctn;
      cb(null, ctn);
    });
  });
};

Thread.prototype.groupBySubject = function(root, cb) {
  if (!cb) {
    throw new Error('Usage: groupBySubject(root, cb)');
  }
  var subjectTable = {};
  asynk.each(root.children, function(container, cb) {
    var c;
    if (!container.message) {
      c = container.children[0];
    } else {
      c = container;
    }
    
    if (!c || !c.message) {
      return cb();
    }
    
    var message = c.message;

    var subject = helpers.normalizeSubject(message.subject);
    if (subject.length === 0) {
      return;
    }
    var existing = subjectTable[subject];

    if (! existing) {
      subjectTable[subject] = c;
    } else if (!_.isUndefined(existing.message) && (_.isUndefined(c.message) || helpers.isReplyOrForward(existing.message.subject) && !helpers.isReplyOrForward(message.subject) ) ) {
      subjectTable[subject] = c;
    }
    
    cb();
  }).alias('subjectTable')
  .each(root.children , function(container, cb) {
    if (container.message) {
      var subject = container.message.subject;
    } else {
      var subject = container.children[0].message.subject;
    }

    subject = helpers.normalizeSubject(subject);
    var c = subjectTable[subject];

    if (! c || c === container) {
      return cb();
    }

    if (_.isUndefined(c.message) && _.isUndefined(container.message)) {
      asynk.each(container.children, function(ctr, cb) {
        c.addChild(ctr, cb);
      }).serie().done(function() { cb(); }).fail(cb);
      container.parent.removeChild(container, cb);
    } else if (_.isUndefined(c.message) && !_.isUndefined(container.message)) {
      c.addChild(container, cb);
    } else if ( !helpers.isReplyOrForward(c.message.subject) && helpers.isReplyOrForward(container.message.subject) ) {
      c.addChild(container, cb);
    } else {
      self.messageContainer(function(err, newContainer) {
        if (err) {
          return cb(err);
        }
        newContainer.addChild(c, function(err) {
          if (err) {
            return cb(err);
          }
          newContainer.addChild(container, function(err) {
            if (err) {
              return cb(err);
            }
            subjectTable[subject] = newContainer;
            cb();
          });
        });
      });
    }        
  }).require('subjectTable').serie().fail(cb).done(function() { cb(null, subjectTable); });
};