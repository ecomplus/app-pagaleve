const createAxios = require('./create-axios')
const auth = require('./create-auth')

const firestoreColl = 'pagaleve_tokens'
module.exports = function (username, password, isSandbox, storeId) {
  const self = this

  let documentRef
  if (firestoreColl) {
    documentRef = require('firebase-admin')
      .firestore()
      .doc(`${firestoreColl}/${storeId}`)
  }

  this.preparing = new Promise((resolve, reject) => {
    const authenticate = (accessToken, isSandbox) => {
      self.axios = createAxios(accessToken, isSandbox)
      resolve(self)
    }

    const handleAuth = (isSandbox) => {
      console.log('> Pagaleve Auth02 ', storeId)
      auth(username, password, storeId, isSandbox)
        .then((data) => {
          console.log('> Pagaleve token => ', data)
          authenticate(data.access_token, isSandbox)
          if (documentRef) {
            documentRef.set({
              ...data,
              isSandbox,
              updatedAt: new Date().toISOString()

            }).catch(console.error)
          }
        })
        .catch(reject)
    }

    if (documentRef) {
      documentRef.get()
        .then((documentSnapshot) => {
          if (documentSnapshot.exists &&
            Date.now() - documentSnapshot.updateTime.toDate().getTime() <= 50 * 60 * 1000 // access token expires in 18 hours
          ) {
            authenticate(documentSnapshot.get('access_token'), isSandbox)
          } else {
            handleAuth(isSandbox)
          }
        })
        .catch(console.error)
    } else {
      handleAuth(isSandbox)
    }
  })
}
