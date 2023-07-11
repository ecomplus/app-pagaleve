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
    const authenticate = (token, isSandbox) => {
      self.axios = createAxios(token, isSandbox)
      resolve(self)
    }

    const handleAuth = (isSandbox) => {
      console.log('> Pagaleve Auth02 ', storeId)
      auth(username, password, storeId, isSandbox)
        .then((data) => {
          console.log('> Pagaleve token => ', data)
          authenticate(data.token, isSandbox)
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
            Date.now() - documentSnapshot.updateTime.toDate().getTime() <= 50 * 60 * 1000 // token expires in 50 min
          ) {
            authenticate(documentSnapshot.get('token'), isSandbox)
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
