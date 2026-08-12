import { BigQuery } from '@google-cloud/bigquery'
import { GoogleAuth } from 'google-auth-library'
import type { BigQueryDatasetOption, BigQueryDiscoveryDefaults, BigQueryProjectOption } from '../shared/bigqueryDiscovery.ts'

interface ProjectsResponse { projects?: Array<{ id?: string; friendlyName?: string }>; nextPageToken?: string }

export class BigQueryDiscoveryService {
  private readonly createBigQuery: (projectId?: string) => BigQuery
  private readonly auth: GoogleAuth

  constructor(
    createBigQuery = (projectId?: string) => new BigQuery(projectId ? { projectId } : undefined),
    auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/bigquery'] })
  ) {
    this.createBigQuery = createBigQuery
    this.auth = auth
  }

  async discoverDefaults(): Promise<BigQueryDiscoveryDefaults> {
    const projectId = await this.auth.getProjectId()
    return projectId ? { projectId } : {}
  }

  async discoverProjects(): Promise<BigQueryProjectOption[]> {
    const client = await this.auth.getClient()
    const projects: BigQueryProjectOption[] = []
    let pageToken: string | undefined
    do {
      const url = new URL('https://bigquery.googleapis.com/bigquery/v2/projects')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const response = await client.request<ProjectsResponse>({ url: url.toString() })
      for (const project of response.data.projects ?? []) if (project.id) projects.push({ projectId: project.id, ...(project.friendlyName ? { friendlyName: project.friendlyName } : {}) })
      pageToken = response.data.nextPageToken
    } while (pageToken)
    return projects.sort((a, b) => a.projectId.localeCompare(b.projectId))
  }

  async listDatasets(projectId: string): Promise<BigQueryDatasetOption[]> {
    const [datasets] = await this.createBigQuery(projectId).getDatasets({ projectId, all: true, autoPaginate: true })
    return datasets.map((dataset) => {
      const metadata = dataset.metadata
      const reference = metadata.datasetReference
      return {
        projectId: reference?.projectId || projectId,
        datasetId: reference?.datasetId || dataset.id,
        ...(metadata.friendlyName ? { friendlyName: metadata.friendlyName } : {}),
        ...(metadata.location ? { location: metadata.location } : {})
      }
    }).sort((a, b) => a.datasetId.localeCompare(b.datasetId))
  }
}

export const bigQueryDiscovery = new BigQueryDiscoveryService()
