var asynk = require('asynk');
var _ = require('lodash');
var Message = require('./message');

var Container = module.exports = function(data, context) {
  if (!data || !context) {
    throw new Error('Usage: Container.Contructor(data, context)');
  }
  if (_.isUndefined(data.id)) {
    throw new Error('Usage: Container.Contructor(data, context) => data object must contain an interger id');
  }
  this.children = [];
  this.context = context;
  this.container = context.container;
  this.conversation = context.conversation;
  this.message = null;
  this.id = data.id;
  if (data.message) {
    if (!(data.message instanceof Message)) {
      throw new Error('Usage: Container.Contructor(data, context) => data.message must be an instance of Message');
    }
    this.message = data.message;
  }
};

Container.prototype.load = function(cache, cb) {
  var self = this;
  // do not load root
  if (self.id === 0) {
    cb();
  }
  this.container._read({id: this.id}, function(err, thisContainer) {
    if (err) {
      return cb(err);
    }
    if (thisContainer.message && thisContainer.message.id) {
      self.message = Message(thisContainer.message.id, thisContainer.message.subject, thisContainer.message.messageId);
    }
    asynk.each(thisContainer.children, function(child, cb) {
      // check if not already in child
      if (!_.find(self.children, {id: child.id})) {
        // check if not in cache
        if (!cache[child.id]) {
          cache[child.id] = new Container(child, self.context);
          self.children.push(cache[child.id]);
          return cache[child.id].load(cache, cb);
        }
        self.children.push(cache[child.id]);
      }
      cb();
    }).add(function(cb) {
      // load parent
      // check parent is not already set
      if (self.parent && self.parent.id) {
        return cb();
      }
      // check if no parent
      if (!thisContainer.parent || !thisContainer.parent.id) {
        return cb();
      }
      // check parent is not in cache
      if (!cache[thisContainer.parent.id]) {
        cache[thisContainer.parent.id] = new Container(thisContainer.parent, self.context);
        self.parent = cache[thisContainer.parent.id];
        return self.parent.load(cache, cb);
      }
      self.parent = cache[thisContainer.parent.id];
      cb();
    }).parallel().fail(cb).done(function() { cb(null, self); });
  });
};

Container.prototype.getConversation = function(id, cb) {
  if (!cb) {
    throw new Error('Usage: getConversation(id, cb)');
  }
  this.getSpecificChild(id, function(err, child) {
    if (err) {
      return cb(err);
    }
    var flattened = [];
    if (child) {
      flattened = child.flattenChildren();
    }
    if (child.message) {
      flattened.unshift(child.message);
    }
    cb(null, flattened);
  });
};

Container.prototype.flattenChildren = function() {
  var messages = [];
  this.children.forEach(function(child) {
    if (child.message) {
      messages.push(child.message);
    }
    var nextChildren = child.flattenChildren();
    if (nextChildren) {
      nextChildren.forEach(function(nextChild) {
        messages.push(nextChild);
      });
    }
  });
  if (messages.length > 0) {
    return messages;
  }
};

Container.prototype.getSpecificChild = function(id, cb) {
  if (!cb) {
    throw new Error('Usage: getSpecificChild(id, cb)');
  }
  var instance = this;
  if (instance.message && instance.message.messageId === id) {
    return cb(null, instance);
  }
  var specificChild = null;
  if (instance.children.length === 0) {
    return cb(null, specificChild);
  }
  asynk.each(instance.children, function(child, cb) {
    child.getSpecificChild(id, function(err, found) {
      if (err) {
        return cb(err);
      }
      if (found) {
        specificChild = found;
      }
      cb();
    });
  }).serie().fail(cb).done(function() {
    cb(null, specificChild);
  });
};

Container.prototype.threadParent = function() {
  if (!this.message) {
    return this;
  }
  var next = this.parent;
  if (!next) {
    return this;
  }
  var top = next;
  while (next) {
    next = next.parent;
    if (next) {
      if (!next.message) {
        return top;
      }
      top = next;
    }
  }
  return top;
};

Container.prototype.addChild = function(child, cb) {
  var self = this;
  if (!cb) {
    throw new Error('Usage: addChild(child, cb)');
  }
  if (!(child instanceof Container)) {
    throw new Error('Usage: addChild(child, cb) => child must be an instance of Container');
  }
  // check if child is already a child
  if (_.find(self.children, {id: child.id})) {
    return cb();
  }
  if (self.children[0] && self.children[0].id === child.id) {
    return cb();
  }
  if (child.parent) {
    return child.parent.removeChild(child, function(err) {
      if (err) {
        return cb(err);
      }
      self.container._update({id: child.id}, {parent: self.id}, function(err) {
        if (err) {
          return cb(err);
        }
        self.children.push(child);
        child.parent = self;
        cb();
      });
    });
  } else {
    self.container._update({id: child.id}, {parent: self.id}, function(err) {
      if (err) {
        return cb(err);
      }
      self.children.push(child);
      child.parent = self;
      cb();
    });
  }
};

Container.prototype.removeChild = function(child, cb) {
  if (!cb) {
    throw new Error('Usage: removeChild(child, cb)');
  }
  if (!(child instanceof Container)) {
    throw new Error('Usage: removeChild(child, cb) => child must be an instance of Container');
  }
  var self = this;
  this.container._update({id: child.id},{parent: null}, function(err) {
    if (err) {
      return cb(err);
    }
    self.children = self.children.filter(function(other) {
      return other !== child;
    });
    cb();
  });
};

Container.prototype.hasDescendant = function(container, cb) {
  if (!cb) {
    throw new Error('Usage: hasDescendant(container, cb)');
  }
  if (!(container instanceof Container)) {
    throw new Error('Usage: hasDescendant(container, cb) => container must be an instance of Container');
  }
  if (this === container) {
    return cb(null, true);
  }
  if (this.children.length < 1) {
    return cb(null, false);
  }
  var descendantPresent = false;
  asynk.each(this.children, function(child, cb) {
    child.hasDescendant(container, function(err, has) {
      if (err) {
        return cb(err);
      }
      if (has) {
        descendantPresent = true;
      }
      cb();
    });
  }).serie().fail(cb).done(function() {
    cb(null, descendantPresent);
  });
};

Container.prototype.setMessage = function(message, cb) {
  if (!cb) {
    throw new Error('Usage: setMessage(message, cb)');
  }
  if (!(message instanceof Message)) {
    throw new Error('Usage: setMessage(message, cb) => message must be an instance of Message');
  }
  var self =this;
  self.container._update({id: self.id}, {message: message.id}, function(err) {
    if (err) {
      return cb(err);
    }
    self.message = message;
    cb();
  });
};
