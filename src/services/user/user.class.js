/* eslint-disable no-unused-vars */
class Service {
  constructor (options) {
    this.options = options || {};
  }

  setup(app) {
    this.app = app;
  }

  async find (params) {
    return [];
  }

  async get (id, params) {
    const achievements = (await this.app.service('achievements').find({
      query: {
        user_id: id
      }
    })).map(achievement => {
      return {
        name: achievement.name,
        amount: achievement.amount,
        scope: achievement.scope
      };
    });

    const xp = (await this.app.service('xp').find({
      query: {
        user_id: id
      }
    })).map(xp => {
      return {
        name: xp.name,
        amount: xp.amount,
      };
    });

    return {
      user_id: id,
      achievements: achievements,
      xp: xp,
      level: 42 // TODO
    };
  }
}

module.exports = function (options) {
  return new Service(options);
};

module.exports.Service = Service;
