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

let idamGroup = "IDAM";
let idamIdPrefix = "idam";
let s2sId = "rpe-service-auth-provider";
let microNames = {};
let legendaryNodeIds = {}; // ids of nodes in legend
let appTypes = [
    { type: "", shape: 'diamond'},
    { type: "-api", shape: 'dot'},
    { type: "-web", shape: 'triangle'}
];

// all edges
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

// container
let container = document.getElementById('api');

// all nodes
function getNodes(data, edgesData, groupOptions) {
    let nodes = data.apis
        .filter(function(micro) {
            return micro.group !== idamGroup && micro.id !== s2sId;
        })
        .map(function(micro) {
            let href = undefined;

            if (micro.spec) {
                href = './swagger.html?url=' + micro.spec
            }

            let idamDependencies = micro.dependencies.filter(function(item) {
                return item.id.substring(0, 4) === idamIdPrefix;
            });

            let tooltip = undefined;

            if (micro.version || micro.description || micro.repository || idamDependencies.length > 0) {
                const microVerDiv = (micro.version ? `(v: ${micro.version})` : '');
                const microrDescpDiv = (micro.description ? `<div>${micro.description}</div>` : '');
                const microRepoDiv = (micro.repository ? `<div>${micro.repository}</div>` : '');
                tooltip = `<h2> ${micro.name} ${microVerDiv} </h2> ${microrDescpDiv} ${microRepoDiv}`;

                if (idamDependencies.length > 0) {
                    tooltip += '<br/>';
                }

                idamDependencies.forEach(function(item) {
                    tooltip += `<div>${idamGroup} ${microNames[item.id]}. Is hard Dependency: ${item.hard} </div>`;
                })
            }

            const groupColour = (idamDependencies.length > 0 ? groupOptions[idamGroup] : groupOptions[micro.group]).color;

            const group = hasKnownType(micro.proType) ? `${micro.group}-${micro.proType}` : micro.group;

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
                value: (edgesData.filter(function(obj) {
                    return obj.to === micro.id;
                }).length + idamDependencies.length) * 5 + 5
            }
        });

    // legend (extra not connected nodes)
    let x = - container.clientWidth / 2 - 150;
    let y = - container.clientHeight / 2 - 150;
    let step = 50;

    data.groups
        .filter(function(group) {
            return group.name !== idamGroup;
        })
        .forEach(function(group, index) {
            let legendId = 1000 + index;

            if (legendaryNodeIds[legendId] === undefined) {
                legendaryNodeIds[legendId] = true;
            }

            nodes.push({
                id: legendId,
                x: x,
                y: y + index * step,
                label: group.name,
                group: group.name,
                value: 1,
                fixed: true,
                physics: false
            });
        });

    return nodes;
}


function hasKnownType(protype) {
    let b = false;
    appTypes.forEach((appType) => {
        b = b || appType.type === `-${protype}`;
    });
    return b;
}

function build(data) {
    // groups
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

    // edges
    let edgesData = getEdges(data);

    // data

    let nodeData = getNodes(data, edgesData, groupOptions);

    // Instantiate our network object.
    let networkData = {
        nodes: nodeData,
        edges: edgesData
    };

    let options = {
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
    let network = new vis.Network(container, networkData, options);
    let networkCanvas = container.getElementsByTagName('canvas')[0];

    network.on('click', function (params) {
        let nodeId = this.getNodeAt(params.pointer.DOM);

        if (legendaryNodeIds[nodeId] !== undefined) {
            legendaryNodeIds[nodeId] = !legendaryNodeIds[nodeId];
            let legendGroup = this.body.nodes[nodeId].options.group;
            let nodeIdsToClear = [];

            network.setData({
                nodes: getNodes(data, edgesData, groupOptions).filter(function(node) {
                    let clear = false;

                    for (let legendId in legendaryNodeIds) {
                        // skip loop if the property is from prototype
                        if (!legendaryNodeIds.hasOwnProperty(legendId)) {
                            continue;
                        }

                        if (!legendaryNodeIds[legendId] && network.body.nodes[legendId].options.group === node.group) {
                            nodeIdsToClear.push(node.id);
                            clear = true;
                            break;
                        }
                    }

                    return !clear || legendaryNodeIds[node.id] !== undefined;
                }),
                edges: getEdges(data).filter(function(edge) {
                    return !nodeIdsToClear.includes(edge.from) && !nodeIdsToClear.includes(edge.to)
                })
            });

            network.redraw();
        }
    });

    network.on('click', function (params) {
        let nodeId = this.getNodeAt(params.pointer.DOM);

        if (this.body.nodes[nodeId]) {
            let href = this.body.nodes[nodeId].options.href;

            if (href) {
                window.open(href, '_blank');
            }
        }
    });

    function changeCursor(newCursorStyle) {
        networkCanvas.style.cursor = newCursorStyle;
    }

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

function load() {
    loadJSON('./microservices.json', function(response) {
        let microservices = JSON.parse(response);
        build(microservices);
    });
}

load();
