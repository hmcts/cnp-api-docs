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
    var edgesData = data.reduce(function(acc, micro) {
        var source = micro.name;
        var dependencies = micro.dependencies || [];
        return acc.concat(dependencies.map(function(item) {
            return {
                from: source,
                to: item.name
            };
        }));
    }, []);

    var nodeData = data.map(function(micro) {
        var href = undefined;

        if (micro.spec) {
            href = './swagger.html?url=' + micro.spec
        }

        var colour = hexToRgbA(micro.colour);
        var hoverColour = hexToRgbA(micro.colour, 0.7);
        var highlightColour = hexToRgbA(micro.colour, 0.9);

        return {
            id: micro.name,
            label: micro.name,
            href: href,
            value: edgesData.filter(function(obj) {
                return obj.to === micro.name;
            }).length * 5 + 5,
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
            // leftover colours from default pastel of 10
            // d35400
            // c0392b
            // bdc3c7
            // 7f8c8d
        }
    });

    // Instantiate our network object.
    var container = document.getElementById('api');
    var networkData = {
        nodes: nodeData,
        edges: edgesData
    };
    var options = {
        nodes: {
            shape: 'dot',
        },
        edges: {
            arrows: {
                to: true
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
        var microData = data.find(function(item) {
            return item.name === params.node;
        });

        document.getElementById('api-spec').innerHTML = '<h2>' + params.node + '(v: ' + microData.version + ')</h2>' +
            '<div>' + microData.description + '</div>' +
            '<div>' + microData.repository + '</div>';

        if (href) {
            changeCursor('pointer');
        }
    });
    network.on('blurNode', function (params) {
        document.getElementById('api-spec').innerHTML = '';

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