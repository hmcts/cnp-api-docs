const assert = require('assert');
const djv = require('djv');
const env = djv();

const refSchema = require('../microservices-schema.json');
const refJson = require('../docs/microservices.json');

describe('microservices.json', () => {
  it('should be valid against schema', () => {
    env.addSchema('microservices', refSchema);

    const errors = env.validate('microservices', refJson);

    assert.equal(errors, undefined);
  });
});
