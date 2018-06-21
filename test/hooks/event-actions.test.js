const assert = require('assert');
const configuration = require('@feathersjs/configuration');
const feathers = require('@feathersjs/feathers');
const services = require('../../src/services');

async function cleanDatabase(app) {
  await require('../../src/models/achievement.model.js')(app).remove({});
  await require('../../src/models/event.model.js')(app).remove({});
  await require('../../src/models/xp.model.js')(app).remove({});
}

describe('\'xp rule checker\' hook', () => {
  let app;
  const user_id = 'TestUser';

  beforeEach(async () => {
    app = feathers();

    app.set('rules', require('../../src/rule-parser')(__dirname + '/../config/xp-rule-checker-config.yml'));
    app.configure(configuration());
    app.configure(require('../../src/mongoose.js'));

    await cleanDatabase(app);
    app.configure(services);

  });

  it('gives standard XP afer an event', async () => {

    const eventName = 'EventGiving10XP';

    await app.service('events').create({
      'name': eventName,
      'user_id': user_id
    });

    const result = await app.service('xp').find({
      query: {
        user_id: user_id,
        name: 'XP'
      }
    });

    assert.deepEqual(result[0].amount, 10);
  });

  it('gives non standard XP after an event', async () => {

    const eventName = 'EventGiving25NonStandardXP';

    await app.service('events').create({
      'name': eventName,
      'user_id': user_id
    });

    const result = await app.service('xp').find({
      query: {
        user_id: user_id,
        name: 'nonStandardXP'
      }
    });

    assert.deepEqual(result[0].amount, 25);
  });

  it('gives non standard XP after an event', async () => {

    const eventName = 'EventGivingMultipleKindsOfXP';

    await app.service('events').create({
      'name': eventName,
      'user_id': user_id
    });

    const result1 = await app.service('xp').find({
      query: {
        user_id: user_id,
        name: 'XP'
      }
    });

    const result2 = await app.service('xp').find({
      query: {
        user_id: user_id,
        name: 'nonStandardXP'
      }
    });

    assert.deepEqual(result1[0].amount, 20);
    assert.deepEqual(result2[0].amount, 30);
  });

  it('updates XP after an event', async () => {

    const eventName = 'EventGiving10XP';

    for (let i = 0; i < 2; i ++) {
      await app.service('events').create({
        'name': eventName,
        'user_id': user_id
      });
    }

    const result = await app.service('xp').find({
      query: {
        user_id: user_id,
        name: 'XP'
      }
    });

    assert.deepEqual(result[0].amount, 20);
  });
});
