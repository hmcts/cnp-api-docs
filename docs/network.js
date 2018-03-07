function hexToRgbA(hex, alpha = 1) {
    var c;

    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }

        c = '0x' + c.join('');

        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',' + alpha + ')';
    }
    throw new Error('Bad Hex');
}

function build(data) {
    var idamGroup = "IdAM";
    var idamIdPrefix = "idam";
    var idamNames = {}

    // edges

    var edgesData = data.apis
        .filter(function(micro) {
            idamNames[micro.id] = micro.name;
            return micro.group != idamGroup;
        })
        .reduce(function(acc, micro) {
            var dependencies = micro.dependencies.filter(function(item) {
                return item.id.substring(0, 4) != idamIdPrefix;
            }) || [];
            return acc.concat(dependencies.map(function(item) {
                return {
                    from: micro.id,
                    to: item.id,
                    dashes: !item.hard
                };
            }));
        }, []);

    // data

    var nodeData = data.apis
        .filter(function(micro) {
            return micro.group != idamGroup;
        })
        .map(function(micro) {
            var href = undefined;

            if (micro.spec) {
                href = './swagger.html?url=' + micro.spec
            }

            var idamDependencies = micro.dependencies.filter(function(item) {
                return item.id.substring(0, 4) == idamIdPrefix;
            })
            console.log(idamDependencies);

            var tooltip = undefined;

            if (micro.version || micro.description || micro.repository || idamDependencies.length > 0) {
                tooltip = '<h2>' + micro.name + (micro.version ? ' (v: ' + micro.version + ')' : '') + '</h2>' +
                    (micro.description ? '<div>' + micro.description + '</div>' : '') +
                    (micro.repository ? '<div>' + micro.repository + '</div>' : '');

                if (idamDependencies.length > 0) {
                    tooltip += '<br/>';
                }

                idamDependencies.forEach(function(item) {
                    tooltip += '<div>' + idamGroup + ' ' + idamNames[item.id] + '. Is hard Dependency: ' + item.hard + '</div>';
                })
            }

            return {
                id: micro.id,
                label: micro.name,
                group: micro.group,
                title: tooltip,
                href: href,
                value: edgesData.filter(function(obj) {
                    return obj.to === micro.id;
                }).length * 5 + 5
            }
        });

    // container

    var container = document.getElementById('api');

    // legend (extra not connected nodes)

    var x = - container.clientWidth / 2 - 150;
    var y = - container.clientHeight / 2 - 150;
    var step = 50;

    data.groups
        .filter(function(group) {
            return group.name != idamGroup;
        })
        .forEach(function(group, index) {
            nodeData.push({
                id: 1000 + index,
                x: x,
                y: y + index * step,
                label: group.name,
                group: group.name,
                value: 1,
                fixed: true,
                physics: false
            });
        });

    // groups

    var groupOptions = {};

    data.groups.forEach(function(group) {
        var colour = hexToRgbA(group.colour);
        var hoverColour = hexToRgbA(group.colour, 0.7);
        var highlightColour = hexToRgbA(group.colour, 0.9);

        groupOptions[group.name] = {
            shape: 'dot',
            color: {
                background: colour,
                border: colour,
                hover: {
                    background: hoverColour,
                    border: hoverColour
                },
                highlight: {
                    background: highlightColour,
                    border: highlightColour
                }
            }
        };
    });

    // Instantiate our network object.

    var networkData = {
        nodes: nodeData,
        edges: edgesData
    };
    var options = {
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
    var network = new vis.Network(container, networkData, options);
    var networkCanvas = container.getElementsByTagName('canvas')[0];

    network.on('click', function (params) {
        var nodeId = this.getNodeAt(params.pointer.DOM);

        if (this.body.nodes[nodeId]) {
            var href = this.body.nodes[nodeId].options.href;

            if (href) {
                window.open(href, '_blank');
            }
        }
    });

    function changeCursor(newCursorStyle){
        networkCanvas.style.cursor = newCursorStyle;
    }

    network.on('hoverNode', function (params) {
        var href = this.body.nodes[params.node].options.href;

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
    var xobj = new XMLHttpRequest();
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
        var microservices = JSON.parse(response);
        build(microservices);
    });
}

load();
