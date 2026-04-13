.. _backup-restore:

Backup & Restore
================

Database Backup
---------------

.. code-block:: bash

   # Create a backup
   docker compose exec postgres pg_dump -U maes_user maes_db > maes_backup_$(date +%Y%m%d).sql

   # Or with custom format (smaller, parallel restore)
   docker compose exec postgres pg_dump -U maes_user -Fc maes_db > maes_backup_$(date +%Y%m%d).dump

Database Restore
----------------

.. code-block:: bash

   # From SQL dump
   cat maes_backup_20250101.sql | docker compose exec -T postgres psql -U maes_user maes_db

   # From custom format
   docker compose exec postgres pg_restore -U maes_user -d maes_db < maes_backup_20250101.dump

Redis Persistence
-----------------

Redis is configured with append-only file (AOF) persistence in the ``redis_data`` volume. No additional backup steps are required for the cache layer.

Extraction Data
---------------

Extraction output files are stored in the ``extractor_output`` Docker volume. To back up:

.. code-block:: bash

   # Copy extraction data from the volume
   docker run --rm -v extractor_output:/data -v $(pwd):/backup alpine tar czf /backup/extractions_backup.tar.gz -C /data .

Compliance Reports
------------------

Reports are stored in the ``compliance-reports`` volume:

.. code-block:: bash

   docker run --rm -v compliance-reports:/data -v $(pwd):/backup alpine tar czf /backup/reports_backup.tar.gz -C /data .

Volume Backup (All)
-------------------

.. code-block:: bash

   # Stop services to ensure consistent state
   docker compose stop

   # Back up all named volumes
   for vol in postgres_data redis_data extractor_output analyzer_output prometheus_data grafana_data loki_data user_certificates compliance-reports; do
     docker run --rm -v "$vol:/data" -v "$(pwd)/backups:/backup" alpine tar czf "/backup/${vol}_$(date +%Y%m%d).tar.gz" -C /data .
   done

   docker compose start
