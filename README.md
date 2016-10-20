# Angular1 Perfect OAuth2

This is started to be a some internal code which I wrote to use (and copy/paste) on my internal projects. I am trying to make a library to avoid code duplication and making it easier manage.

This library is small and it only implements a small part of OAuth2. Therefore it can be improved a lot but I don't currently have time for it. Pull requests are very welcome.

## Usage

```
npm install --save angular1-perfect-oauth2
```

Basically you provide one (or more) providers on configuration phase:

```javascript
app
  .module('hello', [
      require('angular-ui-router'),
      require('angular1-perfect-oauth2')
  ])
  // or
//.module('hello', [
//    'ui.router',
//    'perfect.oauth2'
//])
  .config(function(oauth2Provider) {
      'ngInject';

      oauth2Provider.add('main', {
        endpoints: {
          account: 'https://accounts.blabla.com/',
          some_other_endpoint: 'https://space.blabla.com/'
        },

        client_id: 'client_id',
        client_secret: 'client_secret',

        // you don't need this on password grant
        authorization_url: 'https://accounts.blalba.com/o/oauth2/v2/auth',

        access_token_url: 'https://accounts.blabla.com/o/oauth2/v2/token',

        onToken(oauth2, refresh_token, access_token) {

        },

        onExchangeCode(oauth2, code, data) {
          return true; // go to default route
        },

        onError(oauth2, code, error, retry_logic) {
          // code == 1 means error renewing access_token
          // code == 2 means error exchanging code for token

          console.error('onError 1st time, retrying ', oauth2, code, error);
          return retry_logic() // you can check internet connection etc.
            .then(function(data) {
              console.log('2nd try and successful');

              return data;
            }, function(error) {
              console.error('2nd time and got error: ', error);

            //return retry_logic() // try 3rd time or invalidate the refresh_token etc.
              return Promise.reject(error);
            });
        }
      });
  })
```

then you make sure that no route will ever executed without proper authentication:

```javascript
.run(function($rootScope, oauth2) {
  $rootScope.$on('$stateChangeStart', function(event, toState) {
    // toState.data.free is set on default redirect_uri route
    // you can also allow your login page in Angular (if you do password grant)
    // just make sure to use oauth2.{{your provider id}}.$login(username, pass).then(...) instead of oauth2.{{your provider id}}.$go_authenticate() on your custom password grant login page

    if(!(toState.data && toState.data.free) && !oauth2.main.refresh_token) {
      event.preventDefault();
      oauth2.main.$go_authenticate();
    }
  });
});
```

and you can now use oauth2.{{your provider id}}.$http instead of $http on your controllers, services etc. It'll add Bearer token and renew & retry request  **transparently** when the token became expired. Token expiration is determined by 401 status code.

```javascript
$stateProvider
  .state("hello", {
      url: "/hello",
      template: 'Hello World {{hello.data}}',
      controller: ['oauth2', function(oauth2) {
        var that = this;

        oauth2.main.$http({

        //automatically appends the url that you set as endpoint

          endpoint: 'account',
          path: 'users/me',

          // or you can set directly
        //url: 'https://accounts.blabla.com/users/me'

        }).then(function(data) {
          // server returned success
          // or transparently handled token refreshing mechanism and the request has sent for 2nd time and server returned success.

          that.data = data;
        }, function(error) {
          // connection error or server returned non-2xx on first request
          // server returned on 1st try 401 but token cannot be renewed (1st response is resolved)
        });
      }],
      controllerAs: 'hello'
  });
```
