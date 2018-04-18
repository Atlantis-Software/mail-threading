var helpers = module.exports = {
  isReplyOrForward: function(subject) {
    var pattern = /^(Re|Fwd)/i;
    var match = subject.match(pattern);
    return match ? true : false;
  },
  normalizeSubject: function(subject) {
    var pattern = /((Re|Fwd)(\[[\d+]\])?:(\s)?)*([\w]*)/i;
    var match = subject.match(pattern);
    return match ? match[5] : false;
  },
  normalizeMessageId: function(messageId) {
    var pattern = /<([^<>]+)>/;
    var match = messageId.match(pattern);
    return match ? match[1] : null;
  },
  parseReferences: function(references) {
    if (! references)
      return null;
    var pattern = /<[^<>]+>/g;
    return references.match(pattern).map(function(match) {
      return match.match(/[^<>]+/)[0];
    });
  }
};