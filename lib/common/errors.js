module.exports = {
  invalidHeader: function () {
    return new Error('Remote sent invalid header')
  }
  badFeed: function () {
    return new Error('Remote sent invalid feed message')
  },
  noNonce: function () {
    return new Error('Remote did not include a nonce')
  },
  differentFirstFeed: function () {
    return new Error('First shared hypercore must be the same')
  },
  tooManyFeeds: function () {
    return new Error('Only 128 feeds currently supported. Open a Github issue if you need more')
  },
  tooManyMessages: function () {
    return new Error('Remote sent too many messages on an unopened feed')
  }
}
