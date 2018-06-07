const yaml = require('js-yaml');
const fs   = require('fs');

class AchievementRule {
  constructor(rule, name) {
    this.name = name;
    const requirements = rule['requirements'] === undefined ? [] : rule['requirements'];
    this.requirements = requirements.map(requirement => Requirement.fromYamlRequirement(requirement));
    this.replaces = rule['replaces'] === undefined ? [] : rule['replaces'] ;
    this.maxAwarded = rule['maxAwarded'] === undefined ? 1 : rule['maxAwarded'];
    this.scope = rule['scope'] === undefined ? ['user_id'] : rule['scope'];
    this.actions = rule['actions'] === undefined ? [] : rule['actions'];
    this.hidden = rule['hidden'] === undefined ? false : rule['hidden'];
  }

  async isFulfilled(context) {
    for (const requirement of this.requirements) {
      if (!await requirement.isFulfilled(context)) {
        return false;
      }
    }
    return true;
  }

  async canBeAwarded(context) {
    const achievementService = context.app.service('achievements');
    const awardedSoFar = await achievementService.find({
      query: {
        user_id: context.data.user_id,
        name: this.name
      }
    });
    const amountSoFar = awardedSoFar.length === 0 ? 0 : awardedSoFar[0].amount;
    return amountSoFar < this.maxAwarded;
  }
}

class Requirement {
  constructor(requirement) {
    this.requirement = requirement;
  }

  static fromYamlRequirement(requirement) {
    if (requirement['achievement'] !== undefined) {
      return new AchievementRequirement(requirement);
    }
    if (requirement['xp'] !== undefined) {
      return new XPRequirement(requirement);
    }
    if (requirement['event'] !== undefined) {
      return new EventRequirement(requirement['event']);
    }
    if (requirement['AnyOf'] !== undefined) {
      return new AnyOfRequirement(requirement['AnyOf']);
    }
    if (requirement['OneOf'] !== undefined) {
      return new OneOfRequirement(requirement['OneOf']);
    }
    throw new Error('Invalid requirement: Either achievement, xp or event needs to be set: ' + JSON.stringify(requirement));
  }

  // eslint-disable-next-line no-unused-vars
  async isFulfilled(context) {
    throw new Error('This method needs to be implemented in my subclasses.');
  }

  static isValidAmount(actualAmount, amountCondition) {
    amountCondition = Number.isInteger(amountCondition) ? `>= ${amountCondition}` : amountCondition;
    amountCondition = amountCondition.trim();
    const operator = amountCondition.split(/\s+/)[0];
    const number = parseInt(amountCondition.split(/\s+/)[1]);

    switch(operator) {
    case '==':
      return actualAmount === number;
    case '>':
      return actualAmount > number;
    case '<':
      return actualAmount < number;
    case '>=':
      return actualAmount >= number;
    case '<=':
      return actualAmount <= number;
    case '!=':
      return actualAmount !== number;
    default:
      throw new Error(`Unexpected operator : ${operator}`);
    }
  }
}

class XPRequirement extends Requirement {
  constructor(requirement) {
    requirement['amount'] = requirement['amount'] === undefined ? 1 : requirement['amount'];
    super(requirement);
  }

  async isFulfilled(context) {
    const matches = await context.app.service('xp').find({
      query: {
        user_id: context.data.user_id,
        name: this.requirement['xp']
      }
    });
    if (matches.length === 0) return false;
    if (matches.length > 1) throw new Error('Found more than one match, this should be impossible');
    if (!Requirement.isValidAmount(matches[0].amount, this.requirement['amount'])) return false;

    return true;
  }
}

class AchievementRequirement extends Requirement {
  constructor(requirement) {
    requirement['amount'] = requirement['amount'] === undefined ? 1 : requirement['amount'];
    super(requirement);
  }

  async isFulfilled(context) {
    const matches = await context.app.service('achievements').find({
      query: {
        user_id: context.data.user_id,
        name: this.requirement['achievement']
      }
    });
    if (matches.length === 0) return false;
    if (matches.length > 1) throw new Error('Found more than one match, this should be impossible');
    if (!Requirement.isValidAmount(matches[0].amount, this.requirement['amount'])) return false;

    return true;
  }
}

// TODO perhaps add conditions, events etc for requirements
class EventRequirement extends  Requirement {

  constructor(requirement) {
    requirement['amount'] = requirement['amount'] === undefined ? 1 : requirement['amount'];
    super(requirement);
  }

  conditionFulfilled (condition, matchedEvent) {
    switch(condition) {
    case condition['parameter'] !== undefined:
      return condition['value'] === matchedEvent['context'][condition['parameter']];
    case condition['AnyOf'] !== undefined:
      return this.checkAnyOf(condition['AnyOf'], matchedEvent);
    case condition['OneOf'] !== undefined:
      return this.checkOneOf(condition['OneOf'], matchedEvent);
    default:
      throw new Error(`Invalid Condition params: ${condition}`);
    }
  }

  checkAnyOf (conditions, matchedEvent) {
    return conditions.some( c => {
      return this.conditionFulfilled(c, matchedEvent);
    });
  }


  checkOneOf (conditions, matchedEvent) {
    return conditions.filter( c => {
      return this.conditionFulfilled(c, matchedEvent);
    }).length === 1;
  }

  evalConditions (matchedEvent) {
    const conditions = this.requirement.conditions;

    return conditions.every ( c => {
      return this.conditionFulfilled(c, matchedEvent);
    });
  }

  async isFulfilled(context) {
    const matches = await context.app.service('events').find({
      query: {
        user_id: context.data.user_id,
        name: this.requirement['name'],
      }
    });

    const matchAmount = matches.filter(this.evalConditions).length;
    return Requirement.isValidAmount(matchAmount, this.requirement['amount']);
  }
}

class AnyOfRequirement extends Requirement {
  constructor(innerRequirements) {
    super();
    this.innerRequirements = innerRequirements.map(requirement => Requirement.fromYamlRequirement(requirement));
  }

  async isFulfilled(context) {
    for (const requirement of this.innerRequirements) {
      if(await requirement.isFulfilled(context)) return true;
    }
    return false;
  }
}

class OneOfRequirement extends Requirement {
  constructor(innerRequirements) {
    super();
    this.innerRequirements = innerRequirements.map(requirement => Requirement.fromYamlRequirement(requirement));
  }

  async isFulfilled(context) {
    let fulfilled = false;
    for (const requirement of this.innerRequirements) {
      const requirementIsFulfilled = await requirement.isFulfilled(context);
      // case: two requirements are true
      if (requirementIsFulfilled && fulfilled === true) return false;
      // case: one requirement is true
      if (requirementIsFulfilled && fulfilled === false) fulfilled = true;
    }
    return fulfilled;
  }
}

let rules = yaml.safeLoad(fs.readFileSync('./config/gamification.yml', 'utf8'));

const achievementRules = [];

for (const achievementName of Object.keys(rules['achievements'])) {
  const rule = new AchievementRule(rules['achievements'][achievementName], achievementName);
  achievementRules.push(rule);
}

rules['achievements'] = achievementRules;

module.exports = rules;
