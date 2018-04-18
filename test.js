var itIs = require('it-is');
var Mail = require('./index.js');
var asynk = require('asynk');

function isDummy(container) {
  //return typeof(container.message) === "undefined";
  return container.message === null;
}

function childCount(idTable, id) {
  return idTable[id].children.length;
}

function childMessageId(idTable, id, childIndex) {
  var c = child(idTable, id, childIndex);
  return c.message.messageId;
}

function child(idTable, id, childIndex) {
  if (!idTable[id]) {
    throw new Error('idTable has no index ' + id);
  }
  if (!idTable[id].children[childIndex]) {
    throw new Error('idTable[' + id + '] has no childIndex ' + childIndex);
  }
  return idTable[id].children[childIndex];
}

function createMessage(subject, messageId) {
  return {
    subject: subject,
    messageId: messageId,
    userId: 0,
    categoryId: 0,
    from_email: "test@test.com",
    content: "this is only a test",
    readConfirmation: false,
    size: 10,
    hasAttachment: false,
    read: false,
    answer: false,
    forward: false,
    follow: false
  };
}

var orm = require('../core/orm');
var mail;
var createMessages;

describe('Test conversation', function() {
  before(function(done) {
    orm.get({
      adapter: 'mysql',
      host: 'mysql-dev',
      port: 3306,
      database: 'webmail3',
      user: 'root',
      password: 'Atlantis2013!'
    }, function(err, database) {
      if (err) {
        return done(err);
      }
      mail = new Mail();
      // Conversation CRUD
      mail.conversation.onCreate(function(conversation, cb) {
        database.conversation.create(conversation, cb);
      });
      mail.conversation.onRead(function(where, cb) {
        database.conversation.findOne(where).populate('container').exec(cb);
      });
      mail.conversation.onUpdate(function(where, fields, cb) {
        database.conversation.update(where, fields, cb);
      });
      mail.conversation.onDelete(function(where, cb) {
        database.conversation.destroy(where, cb);
      });
      // Container CRUD
      mail.container.onCreate(function(container, cb) {
        database.container.create(container, cb);
      });
      mail.container.onRead(function(where, cb) {
        database.container.findOne(where).populate('children').populate('message').populate('parent').exec(cb);
      });
      mail.container.onUpdate(function(where, fields, cb) {
        database.container.update(where, fields, cb);
      });
      mail.container.onDelete(function(where, cb) {
        database.container.destroy(where, cb);
      });
      
      createMessages = function(messages, cb) {
        asynk.each(messages, function (msg, cb) {
          database.email.find({ messageId: msg.messageId }, function (err, message) {
            if (err) {
              return cb(err);
            }
            if (message.length) {
              return cb(null, message[0]);
            }
            database.email.create(msg, cb);
          });
        }).serie().done(function (messages) {
          cb(null, messages);
        });
      };

      done();
    });
  });


  // ---- message regex tests ---- #1
  it('it shoud normalize subject', function(done) {
    var util = mail.helpers;
    itIs("Subject").equal(util.normalizeSubject("Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re:Subject"));
    itIs("Subject").equal(util.normalizeSubject("RE:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re: Re[2]:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re[2]:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re: Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re:Re:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Re: Re: Subject"));
    itIs("Subject").equal(util.normalizeSubject("Fwd:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Fwd:Fwd:Subject"));
    itIs("Subject").equal(util.normalizeSubject("Fwd: Fwd: Subject"));
    itIs("Subject").equal(util.normalizeSubject("Fwd: Subject"));

    itIs(true).equal(util.isReplyOrForward("Fwd: Subject"));
    itIs(true).equal(util.isReplyOrForward("Re: Subject"));
    itIs(false).equal(util.isReplyOrForward("Subject"));
    itIs(true).equal(util.isReplyOrForward("RE: Re: Subject"));

    var str = "<e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com>";
    var messageId = "e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com";
    itIs(messageId).equal(util.normalizeMessageId(str));

    var str = "pizza tacos <e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com>";
    var messageId = "e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com";
    itIs(messageId).equal(util.normalizeMessageId(str));

    var str = "a b c";
    var messageId = null;
    itIs(null).equal(util.normalizeMessageId(str));

    var str = "<e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com> asd sf";
    var messageId = ["e22ff8510609251339s53fed0dcka38d118e00ed9ef7@mail.gmail.com"];
    itIs(messageId[0]).equal(util.parseReferences(str)[0]);

    var str = "<a@mail.gmail.com> <b@mail.gmail.com>";
    var messageId = ["a@mail.gmail.com", "b@mail.gmail.com"];
    itIs(messageId[0]).equal(util.parseReferences(str)[0]);
    itIs(messageId[1]).equal(util.parseReferences(str)[1]);

    var str = "<a@mail.gmail.com> <b@mail.gmail.com>";
    var messageId = ["a@mail.gmail.com", "b@mail.gmail.com"];
    itIs(messageId[0]).equal(util.parseReferences(str)[0]);
    itIs(messageId[1]).equal(util.parseReferences(str)[1]);

    var str = "sdf <a> sdf <b> sdf";
    var messageId = ["a", "b"];
    itIs(messageId[0]).equal(util.parseReferences(str)[0]);
    itIs(messageId[1]).equal(util.parseReferences(str)[1]);
    done();
  });

  //
  // a
  // +- b
  //    +- c
  //       +- d
  //          +- e
  // b
  // +- c
  //    +- d
  //       +- e
  // c
  // +- d
  //    +- e
  // d
  // +- e
  // e
  //
  // create idTable for each message #2

  it('it shoud create idTable for each message', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a2"),
      createMessage("subject", "b2"),
      createMessage("subject", "c2"),
      createMessage("subject", "d2"),
      createMessage("subject", "e2")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      thread.createIdTable([
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),                 //a2
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a2"),               //b2
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a2", "b2"]),       //c2
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a2", "b2", "c2"]), //d2
        mail.message(msgs[4].id, msgs[4].subject, msgs[4].messageId, "d2")                //e2
      ], function(err, idTable) {
        if (err) {
          return done(err);
        }

        itIs(msgs[1].messageId).equal(childMessageId(idTable, "a2", 0));
        itIs(msgs[2].messageId).equal(childMessageId(idTable, "b2", 0));
        itIs(msgs[3].messageId).equal(childMessageId(idTable, "c2", 0));
        itIs(msgs[4].messageId).equal(childMessageId(idTable, "d2", 0));
        itIs(0).equal(childCount(idTable, "e2"));
        done();
      });
    });
  });

  //
  // a
  // +- b
  //    +- c
  //       +- d
  //          +- e
  // b
  // +- c
  //    +- d
  //       +- e
  // c
  // +- d
  //    +- e
  // d
  // +- e
  // e
  //
  // test if idTable public reference does not get lost. #3

  it('it shoud test if idTable public reference does not get lost', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a3"),
      createMessage("subject", "b3"),
      createMessage("subject", "c3"),
      createMessage("subject", "d3"),
      createMessage("subject", "e3")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      thread.thread([
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a3"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a3", "b3"]),
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a3", "b3", "c3"]),
        mail.message(msgs[4].id, msgs[4].subject, msgs[4].messageId, "d3")
      ], function(err, root) {
        if (err) {
          return done(err);
        }
        itIs(5).equal(Object.keys(thread.idTable).length);
        done();
      });
    });
  });

  //
  // a
  // +- b
  //    +- c (dummy)
  //       +- d
  //         +- e
  // b
  // +- c (dummy)
  //    +- d
  //       +- e
  // c (dummy)
  // +- e
  //    +- e
  // d
  // +- e
  // e:subject
  //
  // create idTable for each message and dummy containers in case of reference to non-existent message #4

  it('it shoud create idTable for each message and dummy containers in case of reference to non-existent message', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a4"),
      createMessage("subject", "b4"),
      createMessage("subject", "d4"),
      createMessage("subject", "e4")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      thread.createIdTable([
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a4"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a4", "b4", "c4"]),
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, "d4")
      ], function(err, idTable) {
        if (err) {
          return done(err);
        }
        itIs(5).equal(Object.keys(idTable).length);
        itIs(msgs[1].messageId).equal(childMessageId(idTable, "a4", 0));
        itIs(true).equal(isDummy(idTable["c4"]));
        itIs(msgs[2].messageId).equal(childMessageId(idTable, "c4", 0));
        itIs(msgs[3].messageId).equal(childMessageId(idTable, "d4", 0));
        itIs(0).equal(childCount(idTable, "e4"));
        done();
      });      
    });
  });

  //
  // a
  // +- b
  //    +- c (dummy)
  //       +- d
  //          +- e
  // b
  // +- c
  //    +- d
  //       +- e
  // y (dummy)
  // c
  // +- d
  //    +- e
  // z  (dummy)
  // +- y (dummy)
  // d
  // +- e
  // e
  //
  // should create idTable for each message and nested dummy containers in case of references to non-existent messages #5

  it('it should create idTable for each message and nested dummy containers in case of references to non-existent messages', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a5"),
      createMessage("subject", "b5"),
      createMessage("subject", "d5"),
      createMessage("subject", "e5")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      thread.createIdTable([
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a5"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a5", "b5", "c5"]),
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["z5", "y5", "d5"])
      ], function(err, idTable) {
        if (err) {
          return done(err);
        }
        itIs(7).equal(Object.keys(idTable).length);
        itIs(msgs[1].messageId).equal(childMessageId(idTable, "a5", 0));
        itIs(true).equal(isDummy(idTable["c5"]));
        itIs(msgs[2].messageId).equal(childMessageId(idTable, "c5", 0));
        itIs(true).equal(isDummy(idTable["z5"]));
        itIs(true).equal(isDummy(idTable["y5"]));
        itIs(0).equal(childCount(idTable, "y5"));
        itIs(msgs[3].messageId).equal(childMessageId(idTable, "d5", 0));
        itIs(0).equal(childCount(idTable, "e5"));
        done();
      });
    });
  });

  //
  // before:
  // a
  // +- b
  //   +- dummy
  //
  // after:
  // a
  // +- b
  //
  // prune containers with empty message and no children #6

  it('it should prune containers with empty message and no children', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a6"),
      createMessage("subjectB", "b6")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }        
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a6"]), function(err, containerB) {
              if (err) {
                return done(err);
              }
              containerA.addChild(containerB, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(function(err, containerZ) {
                  if (err) {
                    return done(err);
                  }
                  containerB.addChild(containerZ, function(err) {
                    if (err) {
                      return done(err);
                    }
                    thread.pruneEmpties(root, function(err) {
                      if (err) {
                        return done(err);
                      }
                      itIs(containerA).equal(root.children[0]);
                      itIs(1).equal(containerA.children.length);
                      itIs(containerB).equal(containerA.children[0]);
                      itIs(0).equal(containerB.children.length);
                      done();                    
                    });
                  });
                });
              });       
            });          
          });
        });
      });
    });
  });

  //
  // before:
  // a
  // +- b
  //    +- z (dummy)
  //       +- c
  //
  // after:
  // a
  // +- b
  //    +- c
  //
  // prune containers with empty message and 1 non-empty child #7

  it('it should prune containers with empty message and 1 non-empty child', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a7"),
      createMessage("subjectB", "b7"),
      createMessage("subjectC", "c7")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a7"]), function(err, containerB) {
              if (err) {
                return done(err);
              }
              containerA.addChild(containerB, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a7", "z7"]), function(err, containerC) {
                  if (err) {
                    return done(err);
                  }
                  mail.messageContainer(function(err, containerZ) {
                    if (err) {
                      return done(err);
                    }
                    containerB.addChild(containerZ, function(err) {
                      if (err) {
                        return done(err);
                      }
                      containerZ.addChild(containerC, function(err) {
                        if (err) {
                          return done(err);
                        }
                        thread.pruneEmpties(root, function(err) {
                          if (err) {
                            return done(err);
                          }
                          itIs(1).equal(root.children.length);
                          itIs(containerA.id).equal(root.children[0].id);
                          itIs(containerB.id).equal(containerA.children[0].id);
                          itIs(containerC.id).equal(containerB.children[0].id);
                          done();
                        });
                      });
                    });
                  });                 
                });
              });  
            });
          });
        });
      });
    });
  });

  //
  // before:
  // a
  // z (dummy)
  // +- c
  //
  // after:
  // a
  // b
  //
  //
  // promote child of containers with empty message and 1 child directly to root level #8

  it('it should promote child of containers with empty message and 1 child directly to root level', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a8"),
      createMessage("subjectB", "b8")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["z8"]), function(err, containerB) {
              if (err) {
                return done(err);
              }
              mail.messageContainer(function(err, containerZ) {
                if (err) {
                  return done(err);
                }
                root.addChild(containerZ, function(err) {
                  if (err) {
                    return done(err);
                  }
                  containerZ.addChild(containerB, function(err) {
                    if (err) {
                      return done(err);
                    }
                    thread.pruneEmpties(root, function(err) {
                      if (err) {
                        return done(err);
                      }
                      itIs(2).equal(root.children.length);
                      itIs(containerA.id).equal(root.children[0].id);
                      itIs(containerB.id).equal(root.children[1].id);
                      done();                    
                    });
                  });               
                });
              });
            });
          });
        });
      });
    });
  });

  //
  // before:
  // a
  // z (dummy)
  // +- b
  // +- c
  //
  // after:
  // a
  // z (dummy)
  // +- b
  // +- c
  //
  // do *not* promote children of containers with empty message and 2 children directly to root level #9

  it('it should *not* promote children of containers with empty message and 2 children directly to root level', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a9"),
      createMessage("subjectB", "b9"),
      createMessage("subjectC", "c9")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerZ) {
              if (err) {
                return done(err);
              }
              root.addChild(containerZ, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a9", "z9"]), function(err, containerB) {
                  if (err) {
                    return done(err);
                  }
                  containerZ.addChild(containerB, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a9", "z9"]), function(err, containerC) {
                      if (err) {
                        return done(err);
                      }
                      containerZ.addChild(containerC, function(err) {
                        if (err) {
                          return done(err);
                        }
                        thread.pruneEmpties(root, function(err) {
                          if (err) {
                            return done(err);
                          }
                          itIs(2).equal(root.children.length);
                          itIs(containerA.id).equal(root.children[0].id);
                          itIs(true).equal(isDummy(root.children[1]));
                          itIs(2).equal(containerZ.children.length);
                          itIs(containerB.id).equal(containerZ.children[0].id);
                          itIs(containerC.id).equal(containerZ.children[1].id);
                          done();
                        });
                      });
                    });                  
                  });
                });
              });
            });          
          });        
        });
      });
    });
  });

  //
  // before:
  // a
  // z (dummy)
  // +- y (dummy)
  //    +- b
  //    +- c
  //    +- d
  //
  // after:
  // a
  // z (dummy)
  // +- b
  // +- c
  // +- d
  //
  // promote children of containers with empty message and 2 children directly to next level #10

  it('it should promote children of containers with empty message and 2 children directly to next level', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a10"),
      createMessage("subjectB", "b10"),
      createMessage("subjectC", "c10"),
      createMessage("subjectD", "d10")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerZ) {
              if (err) {
                return done(err);
              }
              root.addChild(containerZ, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(function(err, containerY) {
                  if (err) {
                    return done(err);
                  }
                  containerZ.addChild(containerY, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a10", "z10"]), function(err, containerB) {
                      if (err) {
                        return done(err);
                      }
                      containerY.addChild(containerB, function(err) {
                        if (err) {
                          return done(err);
                        }
                        mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a10", "z10"]), function(err, containerC) {
                          if (err) {
                            return done(err);
                          }
                          containerY.addChild(containerC, function(err) {
                            if (err) {
                              return done(err);
                            }
                            mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a10", "z10"]), function(err, containerD) {
                              if (err) {
                                return done(err);
                              }
                              containerY.addChild(containerD, function(err) {
                                if (err) {
                                  return done(err);
                                }
                                thread.pruneEmpties(root, function(err) {
                                  if (err) {
                                    return done(err);
                                  }
                                  itIs(2).equal(root.children.length);
                                  itIs(containerA).equal(root.children[0]);
                                  itIs(true).equal(isDummy(root.children[1]));
                                  itIs(3).equal(root.children[1].children.length);
                                  var children = [];
                                  children.push(root.children[1].children[0].id);
                                  children.push(root.children[1].children[1].id);
                                  children.push(root.children[1].children[2].id);
                                  itIs(children.indexOf(containerD.id) >= 0).equal(true);
                                  itIs(children.indexOf(containerC.id) >= 0).equal(true);
                                  itIs(children.indexOf(containerB.id) >= 0).equal(true);
                                  done();
                                });
                              });
                            });
                          });
                        });
                      });  
                    });                  
                  });       
                });
              });
            });          
          });      
        });
      });
    });
  });

  //
  // before:
  // a
  // z (dummy)
  // +- y (dummy)
  //    +- x (dummy)
  //       +- b
  //       +- c
  // +- d
  //
  // after:
  // a
  // z (dummy)
  // +- b
  // +- c
  // +- d
  //
  // promote children of several containers with empty message and 2 children directly to next level #11
  

  it('it should promote children of several containers with empty message and 2 children directly to next level', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a11"),
      createMessage("subjectB", "b11"),
      createMessage("subjectC", "c11"),
      createMessage("subjectD", "d11")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerZ) {
              if (err) {
                return done(err);
              }
              root.addChild(containerZ, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(function(err, containerY) {
                  if (err) {
                    return done(err);
                  }
                  containerZ.addChild(containerY, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(function(err, containerX) {
                      if (err) {
                        return done(err);
                      }
                      containerY.addChild(containerX, function(err) {
                        if (err) {
                          return done(err);
                        }
                        mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a11", "z11"]), function(err, containerB) {
                          if (err) {
                            return done(err);
                          }
                          containerX.addChild(containerB, function(err) {
                            if (err) {
                              return done(err);
                            }
                            mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a11", "z11"]), function(err, containerC) {
                              if (err) {
                                return done(err);
                              }
                              containerX.addChild(containerC, function(err) {
                                if (err) {
                                  return done(err);
                                }
                                mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a11", "z11"]), function(err, containerD) {
                                  if (err) {
                                    return done(err);
                                  }
                                  containerZ.addChild(containerD, function(err) {
                                    if (err) {
                                      return done(err);
                                    }
                                    thread.pruneEmpties(root, function(err) {
                                      if (err) {
                                        return done(err);
                                      }
                                      itIs(2).equal(root.children.length);
                                      itIs(containerA).equal(root.children[0]);
                                      itIs(true).equal(isDummy(root.children[1]));
                                      itIs(3).equal(containerZ.children.length);
                                      var children = [];
                                      children.push(containerZ.children[0].id);
                                      children.push(containerZ.children[1].id);
                                      children.push(containerZ.children[2].id);
                                      itIs(true).equal(children.indexOf(containerD.id) >= 0);
                                      itIs(true).equal(children.indexOf(containerB.id) >= 0);
                                      itIs(true).equal(children.indexOf(containerC.id) >= 0);
                                      done();
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });  
              });
            });
          });
        });
      });
    });
  });

  //
  // before:
  // z (dummy)
  // +- y (dummy)
  //    +- a
  // +- x (dummy)
  //
  // after:
  // a
  //
  // promote children of several containers with empty message and multiple children #12

  it('it should promote children of several containers with empty message and multiple children', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a12")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(function(err, containerZ) {
          if (err) {
            return done(err);
          }
          root.addChild(containerZ, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerY) {
              if (err) {
                return done(err);
              }
              containerZ.addChild(containerY, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
                  if (err) {
                    return done(err);
                  }
                  containerY.addChild(containerA, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(function(err, containerX) {
                      if (err) {
                        return done(err);
                      }
                      containerZ.addChild(containerX, function(err) {
                        if (err) {
                          return done(err);
                        }
                        thread.pruneEmpties(root, function(err) {
                          if (err) {
                            return done(err);
                          }
                          itIs(1).equal(root.children.length);
                          itIs(containerA.id).equal(root.children[0].id);
                          itIs(0).equal(containerZ.children.length);
                          done();
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  //
  // before:
  // z (dummy)
  // +- y (dummy)
  //    +- x (dummy)
  //       +- w (dummy)
  //          +- a
  //             +- b
  //          +- c
  //             +- d
  // +- v
  //
  // after:
  // z (dummy)
  // +- a
  //    +- b
  // +- c
  //    +- d
  //
  // promote children of several containers with empty message and multiple children 2 #13

  it('it should promote children of several containers with empty message and multiple children 2', function(done) {
    this.timeout(15000);
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a13"),
      createMessage("subjectB", "b13"),
      createMessage("subjectC", "c13"),
      createMessage("subjectD", "d13")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(function(err, containerZ) {
          if (err) {
            return done(err);
          }
          root.addChild(containerZ, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerY) {
              if (err) {
                return done(err);
              }
              containerZ.addChild(containerY, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(function(err, containerX) {
                  if (err) {
                    return done(err);
                  }
                  containerY.addChild(containerX, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(function(err, containerW) {
                      if (err) {
                        return done(err);
                      }
                      containerX.addChild(containerW, function(err) {
                        if (err) {
                          return done(err);
                        }
                        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
                          if (err) {
                            return done(err);
                          }
                          containerW.addChild(containerA, function(err) {
                            if (err) {
                              return done(err);
                            }
                            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a13", "z13"]), function(err, containerB) {
                              if (err) {
                                return done(err);
                              }
                              containerA.addChild(containerB, function(err) {
                                if (err) {
                                  return done(err);
                                }
                                mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a13", "z13"]), function(err, containerC) {
                                  if (err) {
                                    return done(err);
                                  }
                                  containerW.addChild(containerC, function(err) {
                                    if (err) {
                                      return done(err);
                                    }
                                    mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a13", "z13"]), function(err, containerD) {
                                      if (err) {
                                        return done(err);
                                      }
                                      containerC.addChild(containerD, function(err) {
                                        if (err) {
                                          return done(err);
                                        }
                                        mail.messageContainer(function(err, containerV) {
                                          if (err) {
                                            return done(err);
                                          }
                                          containerZ.addChild(containerV, function(err) {
                                            if (err) {
                                              return done(err);
                                            }
                                            thread.pruneEmpties(root, function(err) {
                                              if (err) {
                                                return done(err);
                                              }
                                              itIs(1).equal(root.children.length);
                                              itIs(containerZ).equal(root.children[0]);
                                              itIs(2).equal(containerZ.children.length);
                                              var Zchildren = [];
                                              Zchildren.push(containerZ.children[0].id);
                                              Zchildren.push(containerZ.children[1].id);
                                              itIs(true).equal(Zchildren.indexOf(containerC.id) >= 0);
                                              itIs(true).equal(Zchildren.indexOf(containerA.id) >= 0);
                                              itIs(1).equal(containerA.children.length);
                                              itIs(containerB.id).equal(containerA.children[0].id);
                                              itIs(1).equal(containerC.children.length);
                                              itIs(containerD.id).equal(containerC.children[0].id);
                                              done();
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });      
      });
    });
  });

  //
  // before:
  // z (dummy)
  // +- y (dummy)
  //    +- x (dummy)
  //       +- w (dummy)
  //          +- a
  //             +- b
  //          +- c
  //             +- d
  //    +- v
  //       +- u
  //          +- t
  //             +- s
  //                +- q
  //                   +- e
  //          +- p
  //             +- f
  //
  // after:
  // z (dummy)
  // +- a
  //    +- b
  // +- c
  //    +- d
  // +- e
  // +- f
  //
  // promote children of several containers with empty message and multiple children 3 #14

  it('it should promote children of several containers with empty message and multiple children 3', function(done) {
    this.timeout(15000);
    var thread = mail.messageThread();
    var messages = [
      createMessage("subjectA", "a14"),
      createMessage("subjectB", "b14"),
      createMessage("subjectC", "c14"),
      createMessage("subjectD", "d14"),
      createMessage("subjectE", "e14"),
      createMessage("subjectF", "f14")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(function(err, containerZ) {
          if (err) {
            return done(err);
          }
          root.addChild(containerZ, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(function(err, containerY) {
              if (err) {
                return done(err);
              }
              containerZ.addChild(containerY, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(function(err, containerX) {
                  if (err) {
                    return done(err);
                  }
                  containerY.addChild(containerX, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(function(err, containerW) {
                      if (err) {
                        return done(err);
                      }
                      containerX.addChild(containerW, function(err) {
                        if (err) {
                          return done(err);
                        }
                        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
                          if (err) {
                            return done(err);
                          }
                          containerW.addChild(containerA, function(err) {
                            if (err) {
                              return done(err);
                            }
                            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a14", "z14"]), function(err, containerB) {
                              if (err) {
                                return done(err);
                              }
                              containerA.addChild(containerB, function(err) {
                                if (err) {
                                  return done(err);
                                }
                                mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a14", "z14"]), function(err, containerC) {
                                  if (err) {
                                    return done(err);
                                  }
                                  containerW.addChild(containerC, function(err) {
                                    if (err) {
                                      return done(err);
                                    }
                                    mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a14", "z14"]), function(err, containerD) {
                                      if (err) {
                                        return done(err);
                                      }
                                      containerC.addChild(containerD, function(err) {
                                        if (err) {
                                          return done(err);
                                        }
                                        mail.messageContainer(function(err, containerV) {
                                          if (err) {
                                            return done(err);
                                          }
                                          containerZ.addChild(containerV, function(err) {
                                            if (err) {
                                              return done(err);
                                            }
                                            mail.messageContainer(function(err, containerU) {
                                              if (err) {
                                                return done(err);
                                              }
                                              containerV.addChild(containerU, function(err) {
                                                if (err) {
                                                  return done(err);
                                                }
                                                mail.messageContainer(function(err, containerT) {
                                                  if (err) {
                                                    return done(err);
                                                  }
                                                  containerU.addChild(containerT, function(err) {
                                                    if (err) {
                                                      return done(err);
                                                    }
                                                    mail.messageContainer(function(err, containerS) {
                                                      if (err) {
                                                        return done(err);
                                                      }
                                                      containerT.addChild(containerS, function(err) {
                                                        if (err) {
                                                          return done(err);
                                                        }
                                                        mail.messageContainer(function(err, containerQ) {
                                                          if (err) {
                                                            return done(err);
                                                          }
                                                          containerT.addChild(containerQ, function(err) {
                                                            if (err) {
                                                              return done(err);
                                                            }
                                                            mail.messageContainer(mail.message(msgs[4].id, msgs[4].subject, msgs[4].messageId, []), function(err, containerE) {
                                                              if (err) {
                                                                return done(err);
                                                              }
                                                              containerQ.addChild(containerE, function(err) {
                                                                if (err) {
                                                                  return done(err);
                                                                }
                                                                mail.messageContainer(function(err, containerP) {
                                                                  if (err) {
                                                                    return done(err);
                                                                  }
                                                                  containerU.addChild(containerP, function(err) {
                                                                    if (err) {
                                                                      return done(err);
                                                                    }
                                                                    mail.messageContainer(mail.message(msgs[5].id, msgs[5].subject, msgs[5].messageId, []), function(err, containerF) {
                                                                      if (err) {
                                                                        return done(err);
                                                                      }
                                                                      containerP.addChild(containerF, function(err) {
                                                                        if (err) {
                                                                          return done(err);
                                                                        }
                                                                        thread.pruneEmpties(root, function(err) {
                                                                          if (err) {
                                                                            return done(err);
                                                                          }
                                                                          itIs(1).equal(root.children.length);
                                                                          itIs(containerZ.id).equal(root.children[0].id);
                                                                          itIs(4).equal(containerZ.children.length);
                                                                          var Zchildren = [];
                                                                          Zchildren.push(containerZ.children[0].id);
                                                                          Zchildren.push(containerZ.children[1].id);
                                                                          Zchildren.push(containerZ.children[2].id);
                                                                          Zchildren.push(containerZ.children[3].id);
                                                                          itIs(true).equal(Zchildren.indexOf(containerF.id) >= 0);
                                                                          itIs(true).equal(Zchildren.indexOf(containerE.id) >= 0);
                                                                          itIs(true).equal(Zchildren.indexOf(containerC.id) >= 0);
                                                                          itIs(true).equal(Zchildren.indexOf(containerA.id) >= 0);
                                                                          itIs(1).equal(containerA.children.length);
                                                                          itIs(containerB.id).equal(containerA.children[0].id);
                                                                          itIs(1).equal(containerC.children.length);
                                                                          itIs(containerD.id).equal(containerC.children[0].id);
                                                                          done();
                                                                        });
                                                                      });
                                                                    });
                                                                  });
                                                                });
                                                              });
                                                            });
                                                          });
                                                        });
                                                      });
                                                    });
                                                  });
                                                });
                                              });                         
                                            });
                                          });
                                        });
                                      });              
                                    });
                                  });                  
                                });
                              });
                            });
                          });
                        });
                      });           
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  // group all messages in the root set by subject #15
  it('it should group all messages in the root set by subject', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject_a", "a15"),
      createMessage("Re: subject_z", "b15"),
      createMessage("Re: subject_z", "c15"),
      createMessage("subject_z", "d15")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, []), function(err, containerB) {
              if (err) {
                return done(err);
              }
              root.addChild(containerB, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, []), function(err, containerC) {
                  if (err) {
                    return done(err);
                  }
                  root.addChild(containerC, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, []), function(err, containerD) {
                      if (err) {
                        return done(err);
                      }
                      root.addChild(containerD, function(err) {
                        if (err) {
                          return done(err);
                        }
                        thread.groupBySubject(root, function(err, subjectHash) {
                          if (err) {
                            return done(err);
                          }
                          itIs(true).equal(typeof (subjectHash.subject_a) !== 'undefined');
                          itIs(true).equal(typeof (subjectHash.subject_z) !== 'undefined');
                          itIs(2).equal(root.children.length);
                          var rootChildreen = [];
                          rootChildreen.push(root.children[0].id);
                          rootChildreen.push(root.children[1].id);
                          itIs(true).equal(rootChildreen.indexOf(containerA.id) >= 0);
                          itIs(true).equal(rootChildreen.indexOf(containerD.id) >= 0);
                          itIs(2).equal(containerD.children.length);
                          var Dchildreen = [];
                          Dchildreen.push(containerD.children[0].id);
                          Dchildreen.push(containerD.children[1].id);
                          itIs(true).equal(Dchildreen.indexOf(containerC.id) >= 0);
                          itIs(true).equal(Dchildreen.indexOf(containerB.id) >= 0);
                          done();                
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  // group all messages in the root set by subject including multiple nested messages #16
  it('it should group all messages in the root set by subject including multiple nested messages', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject_a", "a16"),
      createMessage("Re: subject_z", "b16"),
      createMessage("Re: Re: subject_z", "c16"),
      createMessage("subject_z", "d16")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      mail.messageContainer(function(err, root) {
        if (err) {
          return done(err);
        }
        mail.messageContainer(mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, []), function(err, containerA) {
          if (err) {
            return done(err);
          }
          root.addChild(containerA, function(err) {
            if (err) {
              return done(err);
            }
            mail.messageContainer(mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, []), function(err, containerB) {
              if (err) {
                return done(err);
              }
              root.addChild(containerB, function(err) {
                if (err) {
                  return done(err);
                }
                mail.messageContainer(mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, []), function(err, containerC) {
                  if (err) {
                    return done(err);
                  }
                  root.addChild(containerC, function(err) {
                    if (err) {
                      return done(err);
                    }
                    mail.messageContainer(mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, []), function(err, containerD) {
                      if (err) {
                        return done(err);
                      }
                      root.addChild(containerD, function(err) {
                        if (err) {
                          return done(err);
                        }
                        thread.groupBySubject(root, function(err, subjectHash) {
                          if (err) {
                            return done(err);
                          }
                          itIs(true).equal(typeof (subjectHash.subject_a) !== 'undefined');
                          itIs(true).equal(typeof (subjectHash.subject_z) !== 'undefined');
                          itIs(2).equal(root.children.length);
                          var rootChildreen = [];
                          rootChildreen.push(root.children[0].id);
                          rootChildreen.push(root.children[1].id);
                          itIs(true).equal(rootChildreen.indexOf(containerA.id) >= 0);
                          itIs(true).equal(rootChildreen.indexOf(containerD.id) >= 0);
                          itIs(2).equal(containerD.children.length);
                          var Dchildreen = [];
                          Dchildreen.push(containerD.children[0].id);
                          Dchildreen.push(containerD.children[1].id);
                          itIs(true).equal(Dchildreen.indexOf(containerC.id) >= 0);
                          itIs(true).equal(Dchildreen.indexOf(containerB.id) >= 0);
                          done();
                        });
                      });
                    });
                  });
                }); 
              });        
            });
          });
        });
      });
    });
  });

  // create tree based on message-IDs and references #17
  it('it should create tree based on message-IDs and references', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a17"),
      createMessage("subject", "b17"),
      createMessage("subject", "c17"),
      createMessage("subject", "d17"),
      createMessage("subject", "e17")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      var messages = [
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a17"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a17", "b17"]),
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a17", "b17", "c17"]),
        mail.message(msgs[4].id, msgs[4].subject, msgs[4].messageId, ["d17"])
      ];
      thread.thread(messages, function(err, root) {
        if (err) {
          return done(err);
        }
        itIs(1).equal(root.children.length);
        itIs("a17").equal(root.children[0].message.messageId);
        itIs("b17").equal(root.children[0].children[0].message.messageId);
        itIs("c17").equal(root.children[0].children[0].children[0].message.messageId);
        itIs("d17").equal(root.children[0].children[0].children[0].children[0].message.messageId);
        itIs("e17").equal(root.children[0].children[0].children[0].children[0].children[0].message.messageId);

        // ensure getContainer and hasDescendant are working as expected
        root.getSpecificChild("e17", function(err, e) {
          if (err) {
            return done(err);
          }
          itIs(e.message.messageId).equal("e17");
          root.hasDescendant(e, function(err, hasDescendant) {
            if (err) {
              return done(err);
            }
            itIs(hasDescendant).equal(true);
            done();
          });
        });
      });
    });
  });

  //
  // (dummy in place of "a")
  // +- b
  // +- c
  // +- d
  //
  // group messages that point at missing reference message under a dummy #18

  it('it should group messages that point at missing reference message under a dummy', function(done) {
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "b18"),
      createMessage("subject", "c18"),
      createMessage("subject", "d18")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      var messages = [
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, "a18"),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a18"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, "a18")
      ];
      thread.thread(messages, function(err, root) {
        if (err) {
          return done(err);
        }
        itIs(1).equal(root.children.length);
        itIs(null).equal(root.message);
        itIs(3).equal(root.children[0].children.length);
        done();      
      });
    });
  });

  //group multiple threads #19

  it('it should group multiple threads', function(done) {
    this.timeout(15000);
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "g19"),
      createMessage("subject", "h19"),
      createMessage("subject", "i19")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      var messages = [
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ["a19", "b19", "c19"]),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, ["a19", "b19", "c19", "d19"]),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a19", "b19", "c19", "e19", "f19"])
      ];
      thread.thread(messages, function(err, root) {
        if (err) {
          done(err);
        }
        itIs(1).equal(root.children.length);
        itIs(null).equal(root.message);
        itIs(3).equal(root.children[0].children.length);
        done();      
      });
    });
  });

  it('should handle message one by one', function(done) {
    this.timeout(15000);
    var thread = mail.messageThread();
    var messages = [
      createMessage("subject", "a20"),
      createMessage("subject", "b20"),
      createMessage("subject", "c20"),
      createMessage("subject", "d20"),
      createMessage("subject", "e20")
    ];
    createMessages(messages, function(err, msgs) {
      if (err) {
        return done(err);
      }
      var messages = [
        mail.message(msgs[0].id, msgs[0].subject, msgs[0].messageId, ""),
        mail.message(msgs[1].id, msgs[1].subject, msgs[1].messageId, "a20"),
        mail.message(msgs[2].id, msgs[2].subject, msgs[2].messageId, ["a20", "b20"]),
        mail.message(msgs[3].id, msgs[3].subject, msgs[3].messageId, ["a20", "b20", "c20"]),
        mail.message(msgs[4].id, msgs[4].subject, msgs[4].messageId, ["d20"])
      ];
      thread.insert(messages[0], function(err, root) {
        if (err) {
          return done(err);
        }

        thread.insert(messages[1], function(err, root) {
          if (err) {
            return done(err);
          }

          thread.insert(messages[2], function(err, root) {
            if (err) {
              return done(err);
            }

            thread.insert(messages[3], function(err, root) {
              if (err) {
                return done(err);
              }

              thread.insert(messages[4], function(err, msg) {
                if (err) {
                  return done(err);
                }

                itIs("e20").equal(msg.message.messageId);
                itIs("d20").equal(msg.parent.message.messageId);
                itIs("c20").equal(msg.parent.parent.message.messageId);
                itIs("b20").equal(msg.parent.parent.parent.message.messageId);
                itIs("a20").equal(msg.parent.parent.parent.parent.message.messageId);

                // ensure getContainer and hasDescendant are working as expected
                msg.parent.parent.parent.parent.getSpecificChild("e20", function(err, e) {
                  if (err) {
                    return done(err);
                  }
                  //itIs(e.message.references).deepEqual(["d17"]);
                  msg.parent.parent.parent.parent.hasDescendant(e, function(err, hasDescendant) {
                    if (err) {
                      return done(err);
                    }
                    itIs(hasDescendant).equal(true);
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });

});