# DataPipe Integration Notes

## How DataPipe Works

DataPipe (https://pipe.jspsych.org) is a service that helps send jsPsych experiment data to the Open Science Framework (OSF).

### Two Ways to Use DataPipe:

#### Option 1: Manual DataPipe Experiment Creation
1. Go to https://pipe.jspsych.org
2. Create an account and log in
3. Create a new experiment (you'll need your OSF project ID)
4. DataPipe will give you an experiment ID
5. Configure your experiment with this ID:
   ```json
   POST /experiments/{id}/datapipe/config
   {
     "project_id": "your-osf-project-id",
     "datapipe_experiment_id": "datapipe-provided-id"
   }
   ```

#### Option 2: Automatic Creation (if DataPipe API supports it)
1. Configure just the OSF project ID:
   ```json
   POST /experiments/{id}/datapipe/config
   {
     "project_id": "your-osf-project-id",
     "component_id": "optional-component-id"
   }
   ```
2. Create experiment on DataPipe:
   ```json
   POST /experiments/{id}/datapipe/create
   ```
   This will attempt to create the experiment via API and get the DataPipe ID automatically.

### Sending Data

Once configured, data is automatically sent when participants complete experiments. You can also manually sync:
```json
POST /experiments/{id}/datapipe/sync
```

### Important Notes:
- DataPipe handles the authentication with OSF
- Each experiment needs its own DataPipe experiment ID
- Data is sent in real-time or can be batch synced
- DataPipe preserves the jsPsych data structure

### Testing
To test DataPipe integration:
1. Create a test OSF project at https://osf.io
2. Note the project ID from the URL (e.g., "abc123" from osf.io/abc123)
3. Configure your experiment with this project ID
4. Run a test participant through your experiment
5. Check your OSF project for the data

### API Endpoints Summary:
- `POST /experiments/{id}/datapipe/config` - Configure DataPipe settings
- `POST /experiments/{id}/datapipe/create` - Create experiment on DataPipe (if API supported)
- `POST /experiments/{id}/datapipe/sync` - Manually sync data
- `GET /experiments/{id}/datapipe/status` - Check sync status
- `GET /experiments/{id}/datapipe/info` - Get DataPipe experiment info