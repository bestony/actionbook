import { Command } from 'commander'
import { Actionbook } from '@actionbookdev/sdk'
import { getApiKey, handleError } from '../output.js'

export const getCommand = new Command('get')
  .alias('g')
  .description('Get complete action details by area ID')
  .argument('<area_id>', 'Area ID (e.g., "airbnb.com:/:default")')
  .action(async (areaId: string, options) => {
    try {
      const apiKey = getApiKey(options)
      const client = new Actionbook({ apiKey })

      const result = await client.getActionByAreaId(areaId)

      // Result is now plain text, output directly
      console.log(result)
    } catch (error) {
      handleError(error)
    }
  })
