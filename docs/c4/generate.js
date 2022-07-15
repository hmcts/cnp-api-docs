const microservices = require('../microservices.json');

const servicesByGroup = {};
const servicesByName = {};
const formatName = str => str.toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replaceAll("&", "")
    .replaceAll(",", "");

for (const service of microservices.apis) {
    const serviceName = formatName(service.id);
    servicesByName[serviceName] = service;

    const groupName = formatName(service.group);
    servicesByGroup[groupName] = servicesByGroup[groupName] || [];
    servicesByGroup[groupName].push(service);
}

const getContainer = service => `   ${formatName(service.id)} = container "${service.name}" "${service.description}"`;

const getSystem = groupName => `
${groupName} = softwareSystem "${servicesByGroup[groupName][0].group}" {
${servicesByGroup[groupName].map(getContainer).join('\n')}
}`;

const systems = Object
    .keys(servicesByGroup)
    .map(getSystem)
    .join('');

const getRelationships = service => service.dependencies
    .map(dep => `${formatName(service.id)} -> ${formatName(dep.id)} "Depends on"`)
    .join('\n');

const hasValidDependency = service => service.dependencies.filter(d => servicesByName[formatName(d.id)]).length > 0;

const relationships = microservices.apis
    .filter(hasValidDependency)
    .map(getRelationships)
    .join('\n\n');

console.log(systems);
console.log(relationships);
