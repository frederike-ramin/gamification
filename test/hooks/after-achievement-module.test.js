const assert = require('assert');
const feathers = require('@feathersjs/feathers');
const afterAchievementModule = require('../../src/hooks/after-achievement-module');

describe('\'after-achievement-module\' hook', () => {
  let app;

  beforeEach(() => {
    app = feathers();

    app.use('/dummy', {
      async get(id) {
        return { id };
      }
    });

    app.service('dummy').hooks({
      after: afterAchievementModule()
    });
  });

  it('runs the hook', async () => {
    const result = await app.service('dummy').get('test');

    assert.deepEqual(result, { id: 'test' });
  });
});
