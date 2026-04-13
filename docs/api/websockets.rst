.. _api-websockets:

WebSocket Events
================

The API server exposes a Socket.IO endpoint for real-time updates. Clients connect and join organization-specific rooms.

Connection
----------

The Socket.IO client connects to the same origin as the API. CORS origins are shared with the REST API.

Joining an Organization Room
----------------------------

.. code-block:: javascript

   socket.emit('join-organization', organizationId);

Leaving an Organization Room
----------------------------

.. code-block:: javascript

   socket.emit('leave-organization', organizationId);

Event Reference
---------------

All events are scoped to the organization room (``org-<organizationId>``).

Extraction Events
^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Event
     - Payload
   * - ``extraction.progress``
     - ``{ id, progress, itemsExtracted }``
   * - ``extraction.completed``
     - ``{ id, status, itemsExtracted }``
   * - ``extraction.failed``
     - ``{ id, error }``

Analysis Events
^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Event
     - Payload
   * - ``analysis.started``
     - ``{ id, extractionId, type, status }``
   * - ``analysis.cancelled``
     - ``{ id, status }``

Alert Events
^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Event
     - Payload
   * - ``alert.acknowledged``
     - ``{ id, status, acknowledgedBy }``
   * - ``alert.assigned``
     - ``{ id, assignedTo, status }``
   * - ``alert.resolved``
     - ``{ id, status, resolvedBy }``
   * - ``alert.deleted``
     - ``{ id }``
