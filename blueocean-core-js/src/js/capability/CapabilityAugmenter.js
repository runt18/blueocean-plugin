/**
 * Created by cmeyers on 9/8/16.
 */

const addClass = (clazz, classMap) => {
    const className = clazz._class;

    if (!classMap[className]) {
        // eslint-disable-next-line no-param-reassign
        classMap[className] = [];
    }

    classMap[className].push(clazz);
};

const canWalk = (item) => item && (typeof item === 'object' || Array.isArray(item));

// TODO: can we really filter out 'actions' in all cases? should it use a leading underscore?
const IGNORED_PROPS = ['_links', 'actions'];

/**
 * Decorate an object graph with a '_capabilities' property for each object with a valid '_class'
 * Usage:
 *      import { capabilityAugmenter } from '@jenkins-cd/blueocean-core-js';
 *      const augmentCapability = capabilityAugmenter.augmentCapability;
 *
 *      fetch(url, fetchOptions)
 *          .then(data => augmentCapability(data));
 */
export class CapabilityAugmenter {

    constructor(capabilityStore) {
        this._capabilityStore = capabilityStore;
        this._loggingEnabled = false;
    }

    /**
     * Add "_capabilities" data or all objects with a "_class" property.
     *
     * @param data
     * @returns {Promise}
     */
    augmentCapabilities(data) {
        const classMap = this._findClassesInTree(data);
        return this._resolveCapabilities(data, classMap);
    }

    enablePerfLogging() {
        this._loggingEnabled = true;
    }

    /**
     * Find all of the distinct "_class" values in supplied object.
     *
     * @param data
     * @returns {object} key= "_class" name, value= array of all objects of that class.
     * @private
     */
    _findClassesInTree(data) {
        const classMap = {};
        const nodesToWalk = [data];
        const nodesAlreadyWalked = [];
        const started = new Date().getTime();

        let node = nodesToWalk.shift();

        while (node) {
            nodesAlreadyWalked.push(node);

            // save a ref to the class we can augment it later
            if (typeof node === 'object' && node._class) {
                addClass(node, classMap);
            }

            const nodeKeys = Object.keys(node);

            for (const key of nodeKeys) {
                const value = node[key];

                // walk this node at a later iteration as long as
                // 1. we didn't already walk it (cycles cause an infinite loop otherwise)
                // 2. the property name isn't on the blacklist
                if (canWalk(value) && nodesAlreadyWalked.indexOf(value) === -1 && IGNORED_PROPS.indexOf(key) === -1) {
                    nodesToWalk.push(value);
                }
            }

            node = nodesToWalk.shift();
        }

        if (this._loggingEnabled) {
            console.debug(`augmenter.parse: ${new Date().getTime() - started}ms`);
        }

        return classMap;
    }

    _resolveCapabilities(data, classMap) {
        const classNames = Object.keys(classMap);

        return this._capabilityStore.resolveCapabilities(...classNames)
            .then(capabilitiesMap => this._injectCapabilities(classMap, capabilitiesMap))
            .then(() => data);
    }

    /**
     * Add the capabilities to the "_capabilities" property of all objects in the class map.
     *
     * @param classMap
     * @param capabilitiesMap
     * @returns {object} classMap
     * @private
     */
    _injectCapabilities(classMap, capabilitiesMap) {
        const started = new Date().getTime();

        for (const className of Object.keys(classMap)) {
            for (const target of classMap[className]) {
                const capabilities = capabilitiesMap[className];

                if (!capabilities) {
                    console.warn(`could not resolve capabilities for ${className}; an error may have occurred during lookup`);
                }

                target._capabilities = capabilities || [];
            }
        }

        if (this._loggingEnabled) {
            console.debug(`augmenter.inject: ${new Date().getTime() - started}ms`);
        }

        return classMap;
    }

}
