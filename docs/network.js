const idamGroup = "IDAM";
const idamIdPrefix = "idam";
const s2sId = "rpe-service-auth-provider";


const formatName = str => str.toLowerCase()
  .replaceAll(" ", "_")
  .replaceAll("-", "_")
  .replaceAll("&", "")
  .replaceAll(",", "");

let networkCanvas;
let container = document.getElementById('api');
let appTypes = {};
let microNames = {};
let legendaryNodeIds = {};

load();

function load() {
    loadJSON('./microservices.json', (response) => {build(JSON.parse(response));});
}

// load data
function loadJSON(file, callback) {
    let xobj = new XMLHttpRequest();
    xobj.overrideMimeType('application/json');
    xobj.open('GET', file, true); // Replace 'my_data' with the path to your file
    xobj.onreadystatechange = function () {
        if (xobj.readyState == 4 && xobj.status == '200') {
            // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
            callback(xobj.responseText);
        }
    };
    xobj.send(null);
}

function build(data) {
    appTypes = data.appTypes;
    // groups
    let groupOptions = createGroups(data);

    // edges
    let edgesData = getEdges(data);

    // data
    let nodeData = getNodes(data, edgesData, groupOptions);

    // Instantiate our network object.
    let networkData = {
        nodes: nodeData,
        edges: edgesData
    };

    let visOptions = createVisOptions(groupOptions);

    let network = new vis.Network(container, networkData, visOptions);
    networkCanvas = container.getElementsByTagName('canvas')[0];

    network.on('click', function (params) {
        const nodeId = this.getNodeAt(params.pointer.DOM);
        const node = this.body.nodes[nodeId];

        if (node) {
            let href = node.options.href;

            if (href) {
                window.open(href, '_blank');
            }
        }
    });
    network.on('hoverNode', function (params) {
        let href = this.body.nodes[params.node].options.href;

        if (href) {
            changeCursor('pointer');
        }
    });
    network.on('blurNode', function (params) {
        changeCursor('default');
    });
}

//////////////////////////////////////////////
//////////////////////////////////////////////
//CREATE GROUP
//////////////////////////////////////////////
//////////////////////////////////////////////

function createGroups(data) {
    let groupOptions = {};
    data.groups.forEach(function(group) {
        let colour = hexToRgbA(group.colour);
        let hoverColour = hexToRgbA(group.colour, 0.7);
        let highlightColour = hexToRgbA(group.colour, 0.9);

        appTypes.forEach((type) =>
            groupOptions[`${group.name}${type.type}`] = {
                shape: type.shape,
                color: {
                    background: colour,
                    hover: {
                        background: hoverColour
                    },
                    highlight: {
                        background: highlightColour
                    }
                }
            }
        );
    });
    return groupOptions;
}

function hexToRgbA(hex, alpha = 1) {
    let c;

    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');

        if (c.length === 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }

        c = '0x' + c.join('');

        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',' + alpha + ')';
    }
    throw new Error('Bad Hex');
}


//////////////////////////////////////////////
//////////////////////////////////////////////
// GET EDGES
//////////////////////////////////////////////
//////////////////////////////////////////////

function getEdges(data) {
    return data.apis
        .filter(function(micro) {
            microNames[micro.id] = micro.name;
            return micro.group !== idamGroup && micro.id !== s2sId;
        })
        .reduce(function(acc, micro) {
            let dependencies = micro.dependencies.filter(function(item) {
                return item.id.substring(0, 4) !== idamIdPrefix && item.id !== s2sId;
            }) || [];

            return acc.concat(dependencies.map(function(item) {
                return {
                    from: micro.id,
                    to: item.id,
                    dashes: !item.hard
                };
            }));
        }, []);
}

//////////////////////////////////////////////
//////////////////////////////////////////////
// GET NODES
//////////////////////////////////////////////
//////////////////////////////////////////////

function getNodes(data, edgesData, groupOptions) {
    let nodes = data.apis
        .filter((micro) => {
            return micro.group !== idamGroup && micro.id !== s2sId;
        })
        .map(function(micro) {
            let href = prepareLink(micro.urls, micro.spec);

            let idamDependencies = micro.dependencies.filter((item) => {
                return item.id.substring(0, 4) === idamIdPrefix;
            });

            const tooltip = getToolTip(micro,idamDependencies);
            const group = hasKnownType(micro.type) ? `${micro.group}-${micro.type}` : micro.group;
            const groupColour = groupOptions[micro.group].color;

            return {
                id: micro.id,
                label: micro.name,
                group: group,
                title: tooltip,
                href: href,
                borderWidth: idamDependencies.length * 2,
                color: {
                    border: groupColour.background,
                    hover: {
                        border: groupColour.hover.background
                    },
                    highlight: {
                        border: groupColour.highlight.background
                    }
                },
                value: (edgesData.filter((obj) => {return obj.to === micro.id;}).length + idamDependencies.length) * 5 + 5,
                mass: 1,
            }
        });

    // legend (extra not connected nodes)
    let x = (-container.clientWidth / 2) - 200;
    let y = (-container.clientHeight);
    let step = 50;

    //Create legendaryNodeIds
    data.groups
        .filter(function(group) {
            return group.name !== idamGroup;
        })
        .forEach(function(group, index) {
            let legendId = 1000 + index;
            if (legendaryNodeIds[legendId] === undefined) {legendaryNodeIds[legendId] = true;}
            nodes.push({
                id: legendId,
                x: x,
                y: y + (index * step),
                label: group.name,
                group: group.name,
                value: 1,
                fixed: true,
                physics: false,
                href: "lld/" + formatName(group.name) + ".html"
            });
        });

    return nodes;
}

function prepareLink(urls, spec) {
    let href = "";
    if (typeof urls !== 'undefined' && urls && Array.isArray(urls) && urls.length > 0) {
        let apis = JSON.stringify(urls);
        href = `./swagger.html?apis=${apis}`;
    } else {
        href = spec ? `./swagger.html?url=${spec}` : undefined;
    }
    return href;
}

function getToolTip(micro,idamDependencies) {
    let tooltip = "";
    if (micro.version || micro.description || micro.repository || idamDependencies.length > 0) {
        const microVerDiv = (micro.version ? `(v: ${micro.version})` : '');
        const microrDescpDiv = (micro.description ? `<div>${micro.description}</div>` : '');
        const microRepoDiv = (micro.repository ? `<div>${micro.repository}</div>` : '');
        tooltip += `<h2> ${micro.name} ${microVerDiv} </h2> ${microrDescpDiv} ${microRepoDiv}`;

        if (idamDependencies.length > 0) {
            tooltip += '<br/>';
        }

        idamDependencies.forEach(function(item) {
            tooltip += `<div>${idamGroup} ${microNames[item.id]}. Is hard Dependency: ${item.hard} </div>`;
        })
    }
    return tooltip;
}

function hasKnownType(type) {
    let b = false;
    appTypes.forEach((appType) => {
        b = b || appType.type === `-${type}`;
    });
    return b;
}


//////////////////////////////////////////////
//////////////////////////////////////////////
// Create Vis Options
//////////////////////////////////////////////
//////////////////////////////////////////////
function createVisOptions(groupOptions) {
    return {
        autoResize: true,
        height: '100%',
        width: '100%',
        locale: 'en',
        groups: groupOptions,
        edges: {
            arrows: {
                to: true
            }
        },
        physics: {
            solver: "forceAtlas2Based",
            forceAtlas2Based: {
                avoidOverlap: 1
            }
        },
        interaction: {
            hover: true
        }
    };
}

function isPartOfGroup(nodeGroup, selectGroup) {
    let b = false;
    appTypes.forEach((appType) => {
        b = b || nodeGroup === `${selectGroup}${appType.type}`;
    });
    return b;
}

function changeCursor(newCursorStyle) {
    networkCanvas.style.cursor = newCursorStyle;
}
