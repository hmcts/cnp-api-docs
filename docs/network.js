function build(data) {
    // populate list
    var apiList = document.getElementById('apis');

    data.forEach(function(el) {
        console.log(el);
        if (el.spec) {
            apiList.insertAdjacentHTML('beforeend', '<li><a href="./swagger.html?url=' + el.spec + '">' + el.name + '</a></li>');
        } else {
            apiList.insertAdjacentHTML('beforeend', '<li>' + el.name + '</li>');
        }
    });

    var nodeData = data.map(function(micro) {
        var href = undefined;

        if (micro.spec) {
            href = './swagger.html?url=' + micro.spec
        }

        return {
            id: micro.name,
            label: micro.name,
            href: href,
            value: micro.name.length * 20
        }
    });

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

    // Instantiate our network object.
    var container = document.getElementById('api');
    var data = {
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
    var network = new vis.Network(container, data, options);
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