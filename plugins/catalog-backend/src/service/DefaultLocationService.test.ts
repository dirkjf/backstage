/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { DefaultLocationService } from './DefaultLocationService';
import { CatalogProcessingOrchestrator } from '../processing/types';
import { LocationStore } from './types';
import { InputError } from '@backstage/errors';
import { ConfigReader } from '@backstage/config';

describe('DefaultLocationServiceTest', () => {
  const orchestrator: jest.Mocked<CatalogProcessingOrchestrator> = {
    process: jest.fn(),
  };
  const store: jest.Mocked<LocationStore> = {
    deleteLocation: jest.fn(),
    createLocation: jest.fn(),
    listLocations: jest.fn(),
    getLocation: jest.fn(),
  };

  const mockConfig = (allowUnknownType: boolean) =>
    new ConfigReader({
      catalog: {
        locationService: {
          create: {
            allowUnknownType,
          },
        },
      },
    });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createLocation', () => {
    it('should support dry run', async () => {
      store.listLocations.mockResolvedValueOnce([]);
      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Location',
          metadata: {
            name: 'foo',
          },
        },
        refreshKeys: [],
        deferredEntities: [
          {
            entity: {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Component',
              metadata: {
                name: 'bar',
              },
            },
            locationKey: 'file:///tmp/mock.yaml',
          },
        ],
        relations: [],
        errors: [],
      });

      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'bar',
          },
        },
        deferredEntities: [],
        refreshKeys: [],
        relations: [],
        errors: [],
      });

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await locationService.createLocation(
        { type: 'url', target: 'https://backstage.io/catalog-info.yaml' },
        true,
      );

      expect(orchestrator.process).toBeCalledWith({
        entity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Location',
          metadata: {
            annotations: {
              'backstage.io/managed-by-location':
                'url:https://backstage.io/catalog-info.yaml',
              'backstage.io/managed-by-origin-location':
                'url:https://backstage.io/catalog-info.yaml',
            },
            name: 'generated-bbad4f61e08f24e25d5c5e68e13e164f760aff06',
            namespace: 'default',
          },
          spec: {
            target: 'https://backstage.io/catalog-info.yaml',
            type: 'url',
          },
        },
        state: expect.anything(),
      });

      expect(orchestrator.process).toBeCalledWith({
        entity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'bar' },
        },
        state: expect.anything(),
      });
      expect(orchestrator.process).toBeCalledTimes(2);
      expect(store.createLocation).not.toBeCalled();
    });

    it('should check for location existence when running in dry run', async () => {
      const locationSpec = {
        type: 'url',
        target: 'https://backstage.io/catalog-info.yaml',
      };
      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'bar',
          },
        },
        deferredEntities: [],
        refreshKeys: [],
        relations: [],
        errors: [],
      });

      store.listLocations.mockResolvedValueOnce([
        { id: '137', ...locationSpec },
      ]);

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      const result = await locationService.createLocation(
        { type: 'url', target: 'https://backstage.io/catalog-info.yaml' },
        true,
      );

      expect(result.exists).toBe(true);
    });

    it('should fail when there are duplicate entities using dry run', async () => {
      store.listLocations.mockResolvedValueOnce([]);
      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Location',
          metadata: {
            name: 'foo',
          },
        },
        refreshKeys: [],
        deferredEntities: [
          {
            entity: {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Location',
              metadata: {
                name: 'foo',
              },
            },
            locationKey: 'file:///tmp/mock.yaml',
          },
        ],
        relations: [],
        errors: [],
      });

      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Location',
          metadata: {
            name: 'foo',
          },
        },
        deferredEntities: [],
        refreshKeys: [],
        relations: [],
        errors: [],
      });

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await expect(
        locationService.createLocation(
          { type: 'url', target: 'https://backstage.io/catalog-info.yaml' },
          true,
        ),
      ).rejects.toThrow('Duplicate nested entity: location:default/foo');
    });

    it('should return exists false when the location does not exist beforehand', async () => {
      orchestrator.process.mockResolvedValueOnce({
        ok: true,
        state: {},
        completedEntity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'bar',
          },
        },
        refreshKeys: [],
        deferredEntities: [],
        relations: [],
        errors: [],
      });

      store.listLocations.mockResolvedValueOnce([
        { id: '987', type: 'url', target: 'https://example.com' },
      ]);

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      const result = await locationService.createLocation(
        { type: 'url', target: 'https://backstage.io/catalog-info.yaml' },
        true,
      );
      expect(result.exists).toBe(false);
    });

    it('should create location', async () => {
      const locationSpec = {
        type: 'url',
        target: 'https://backstage.io/catalog-info.yaml',
      };

      store.createLocation.mockResolvedValue({
        ...locationSpec,
        id: '123',
      });

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await expect(
        locationService.createLocation(locationSpec, false),
      ).resolves.toEqual({
        entities: [],
        location: {
          id: '123',
          target: 'https://backstage.io/catalog-info.yaml',
          type: 'url',
        },
      });
      expect(store.createLocation).toBeCalledWith({
        target: 'https://backstage.io/catalog-info.yaml',
        type: 'url',
      });
    });

    it('should create location with unknown type if configuration allows it', async () => {
      const locationSpec = {
        type: 'unknown',
        target: 'https://backstage.io/catalog-info.yaml',
      };

      store.createLocation.mockResolvedValue({
        ...locationSpec,
        id: '123',
      });

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(true),
      );
      await expect(
        locationService.createLocation(locationSpec, false),
      ).resolves.toEqual({
        entities: [],
        location: {
          id: '123',
          target: 'https://backstage.io/catalog-info.yaml',
          type: 'unknown',
        },
      });
      expect(store.createLocation).toBeCalledWith({
        target: 'https://backstage.io/catalog-info.yaml',
        type: 'unknown',
      });
    });

    it('should not allow locations of unknown types by default', async () => {
      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        new ConfigReader({}),
      );
      await expect(
        locationService.createLocation(
          {
            type: 'unknown',
            target: 'https://backstage.io/catalog-info.yaml',
          },
          false,
        ),
      ).rejects.toThrow(InputError);
    });

    it('should not allow locations of unknown types if configuration forbids it', async () => {
      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await expect(
        locationService.createLocation(
          {
            type: 'unknown',
            target: 'https://backstage.io/catalog-info.yaml',
          },
          false,
        ),
      ).rejects.toThrow(InputError);
    });

    it('should return default InputError for failed processed entities in dryRun mode', async () => {
      store.listLocations.mockResolvedValueOnce([]);

      orchestrator.process.mockResolvedValueOnce({
        ok: false,
        errors: [new Error('Error: Unable to read url')],
      });

      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await expect(
        locationService.createLocation(
          {
            type: 'url',
            target: 'https://backstage.io/wrong-url/catalog-info.yaml',
          },
          true,
        ),
      ).rejects.toThrow(InputError);
    });
  });

  describe('listLocations', () => {
    it('should call locationStore.deleteLocation', async () => {
      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await locationService.listLocations();
      expect(store.listLocations).toBeCalled();
    });
  });

  describe('deleteLocation', () => {
    it('should call locationStore.deleteLocation', async () => {
      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await locationService.deleteLocation('123');
      expect(store.deleteLocation).toBeCalledWith('123');
    });
  });

  describe('getLocation', () => {
    it('should call locationStore.getLocation', async () => {
      const locationService = new DefaultLocationService(
        store,
        orchestrator,
        mockConfig(false),
      );
      await locationService.getLocation('123');
      expect(store.getLocation).toBeCalledWith('123');
    });
  });
});
