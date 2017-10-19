(function(root, factory) {
  if(typeof define === 'function' && define.amd) {
    define(['angular', 'angular-ui-router'], factory);
  } else if(typeof exports === 'object') {
    module.exports = factory(require('angular'), require('angular-ui-router'));
  } else {
    factory(root.angular, 'ui.router');
  }
})(this, function(angular, uiRouter) {
  function oauth2($state, $http, name, config) {
    this._$http = $http;
    this.$state = $state;
    this.name = name;
    this.config = config;

    this.access_token = localStorage.getItem(name+'_access_token'),
    this.id_token = localStorage.getItem(name+'_id_token'),
    this.refresh_token = localStorage.getItem(name+'_refresh_token');

    this.config.onToken(this, this.refresh_token, this.access_token);
  }

  oauth2.prototype.$logout = function() {
    var that = this;

    localStorage.removeItem(that.name+'_access_token');
    localStorage.removeItem(that.name+'_id_token');
    localStorage.removeItem(that.name+'_refresh_token');

    that.access_token = null;
    that.id_token = null;
    that.refresh_token = null;

    that.config.onToken && that.config.onToken(that.refresh_token, that.access_token);
  };

  oauth2.prototype.$authenticate_resp = function(data) {
    var that = this;

    that.access_token = data.access_token;
    that.id_token = data.id_token;

    if(data.refresh_token) {
      that.refresh_token = data.refresh_token;
      localStorage.setItem(that.name+'_refresh_token', that.refresh_token);
    }

    localStorage.setItem(that.name+'_access_token', that.access_token);
    localStorage.setItem(that.name+'_id_token', that.id_token);

    that.config.onToken && that.config.onToken(that.refresh_token, that.access_token);
  };

  oauth2.prototype.$login = function(username, password) {
    var that = this;

    return this._$http({
        method: 'POST',
        url: that.config.access_token_url,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        transformRequest: form_encoder,
        data: { grant_type: 'password', username: username, password: password, 'client_id': this.config.client_id, 'client_secret': this.config.client_secret }
    }).then(function(data) {
      return that.$authenticate_resp(data.data);
    });
  };

  function form_encoder(obj) {
      var str = [];

      for(var p in obj)
          if(obj.hasOwnProperty(p))
              str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));

      return str.join("&");
  };

  oauth2.prototype.$renew = function() {
    var that = this;

    if(that._renew_prom)
      return that._renew_prom;

    return (that._renew_prom = that._$renew())
      .then(function(data) {
        that._renew_prom = null;
        return data;
      }, function(error) {
        return (that.config.onError && that.config.onError(that, 1, error, function() {
          return that._$renew();
        })) || Promise.reject(error);
      })
      .then(function(data) {
        that._renew_prom = null;
        return data;
      }, function(error) {
        that._renew_prom = null;
        return Promise.reject(error);
      });
  };

  oauth2.prototype._$renew = function() {
    var that = this;
    return that._$http({
        method: 'POST',
        url: that.config.access_token_url,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        transformRequest: form_encoder,
        data: { grant_type: 'refresh_token', refresh_token: that.refresh_token, 'client_id': this.config.client_id, 'client_secret': this.config.client_secret }
    }).then(function(data) {
      return that.$authenticate_resp(data.data);
    });
  };

  oauth2.prototype.$exchange = function(code) {
    var that = this;
    return that._$http({
        method: 'POST',
        url: that.config.access_token_url,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        transformRequest: form_encoder,
        data: { grant_type: 'authorization_code', code: code, 'client_id': this.config.client_id, 'client_secret': this.config.client_secret, 'redirect_uri': this.$state.href(this.$state.current.name, {id: this.$state.params.id}, {absolute:true, inherit:false}) }
    }).then(function(data) {
      return that.$authenticate_resp(data.data);
    });
  };

  function appendQs(url, key, value) {
    return url + (url.indexOf('?') >= 0 ? "&" : '?') + encodeURIComponent(key) + "=" + encodeURIComponent(value);
  }

  oauth2.prototype.$go_authenticate_url = function(redirect_uri) {
    var qs = appendQs(this.config.authorization_url, 'client_id', this.config.client_id);
    qs = appendQs(qs, 'redirect_uri', redirect_uri || this.$state.href('_oauth2_exchange', {id: this.name}, {absolute: true}));
    qs = appendQs(qs, 'response_type', 'code');
    if(this.config.scope) qs = appendQs(qs, 'scope', this.config.scope);

    return qs;
  };

  oauth2.prototype.$go_authenticate = function(redirect_uri) {
    window.location.href = this.$go_authenticate_url(redirect_uri);
  };

  function extend(obj1, obj2) {
    for (var i in obj2) {
        if (obj2.hasOwnProperty(i)) {
           obj1[i] = obj2[i];
        }
     }
     return obj1;
  }

  oauth2.prototype.$http = function(config) {
    var that = this;

    function try_http() {
      return that._$http(extend(config, {
        url: config.path ? (that.config.base_url || (config.endpoint && that.config.endpoints && that.config.endpoints[config.endpoint])) + '/' + config.path : config.url,
        headers: extend(config.headers || {}, {
          'Authorization': 'Bearer ' + that.access_token
        })
      })).then(function(data) {
        return data.data;
      }, function(error) {
        if(error.status === 401) {
          return that.$renew()
            .then(function() {
              return try_http();
            }, function(error1) {
              console.errro('Error renewing access_token: ', error1);
              return Promise.reject(error);
            });
        }

        return Promise.reject(error);
      });
    }

    return try_http();
  };

  function oauth2Provider($stateProvider) {
    this.obj = [];

    $stateProvider.state('_oauth2_exchange', {
      url: '/o/oauth2/:id/callback?code',
      template: '<div>Loading</div>',
      controller: ['oauth2', '$stateParams', function(oauth2, $stateParams) {
        var module = oauth2[$stateParams.id];

        function do1() {
          return module
            .$exchange($stateParams.code)
            .then(function(data) {
              return (module.config.onExchangeCode && module.config.onExchangeCode(module, $stateParams.code, data)) || true;
            })
            .catch(function(error) {
              return module.config.onError && module.config.onError(module.config, 2, error, function() {
                return module
                  .$exchange($stateParams.code);
              });
            });
        }

        do1();
      }],
      data: {
        free: true
      }
    });
  }

  oauth2Provider.prototype.config = function(config) {

  };

  oauth2Provider.prototype.add = function(name, config) {
    this.obj.push({name: name, config: config});
  };

  oauth2Provider.prototype.$get = ["$state", "$http", function($state, $http) {
    if(this.service)
      return this.service;

    this.service = {};

    for(var i = 0; i < this.obj.length; ++i) {
      this.service[this.obj[i].name] = new oauth2($state, $http, this.obj[i].name, this.obj[i].config);
    }

    return this.service;
  }];

  return angular
    .module('perfect.oauth2', [uiRouter])
    .provider('oauth2', ['$stateProvider', oauth2Provider])
    .factory('oauth2Factory', ['$state', '$http', function($state, $http) {
      return function(name_or_config,config) {
        return new oauth2($state, $http, name_or_config.name || name_or_config, (name_or_config.name && name_or_config) || config);
      };
    }])
    .name;
});
