import { APIGatewayProxyHandler } from 'aws-lambda';
import 'source-map-support/register';
import axios from 'axios';
import { DynamoDB } from 'aws-sdk';

const mapping = [
  { id: 360051512953, title: 'Select a Model ', apiFieldKey: 'Vehicle Model' },
  { id: 360051523513, title: 'Issue', apiFieldKey: '' },
  { id: 360051505273, title: 'Priority', apiFieldKey: '' },
  { id: 1500001432801, title: 'City/Outside City', apiFieldKey: 'city/Outside city' },
  {
    id: 360050563094,
    title: 'State',
    apiFieldKey: (row, ticket_field) => {
      const { custom_field_options } = ticket_field;
      const { state, city } = row;

      const option = custom_field_options.find((opt) => {
        return opt.name.toUpperCase() == `${state}::${city}`.toUpperCase();
      });

      return option ? option.value : '';
    },
  },
  { id: 360050567214, title: 'Europ Ticket ID ', apiFieldKey: 'CaseId' },
  { id: 1500001485662, title: 'Service ID', apiFieldKey: 'ServiceId' },
  { id: 360057496793, titlce: 'Case Creation Date ', apiFieldKey: ['Case creation Date', 'Case creation time'] },
  { id: 1500001433161, title: 'ASP Expected Time ', apiFieldKey: 'aspExpectedStartTime' },
  { id: 1500001432821, title: 'Rider Name', apiFieldKey: 'Rider Name' },
  { id: 360056494354, title: 'RSA Case Status', apiFieldKey: 'Status' },
  { id: 1500001485682, title: 'Breakdown Cause', apiFieldKey: 'BD Cause' },
  { id: 360057496973, title: 'Vendor Name', apiFieldKey: 'VendorName' },
  { id: 360057496953, title: 'Vendor Type', apiFieldKey: 'Vendor Type' },
  { id: 360056494554, title: 'Vendor Assigned Time', apiFieldKey: 'VendorAssignedTime' },
  { id: 1500001485642, title: 'Vehicle at', apiFieldKey: 'VehicleAt' },
  { id: 360056494374, title: 'Rider Phone', apiFieldKey: 'Rider Phone' },
  { id: 360056494394, title: 'DRS Flag', apiFieldKey: 'DRSAFlag' },
  { id: 1500001433141, title: 'Branch Code', apiFieldKey: 'BranchCode' },
  { id: 360057497133, title: 'ASP Work Completion Time', apiFieldKey: 'aspExpectedCompletionTime' },
  { id: 360056494574, title: 'ASP Reach Time', apiFieldKey: 'aspExpectedReachedTime' },
];

const API_URL = 'https://z3nre.zendesk.com/api/v2';
const FORM_ID = 360006208113;
const dynamodb = new DynamoDB({ apiVersion: '2012-08-10' });

let token = 'sbalasubramanya@zendesk.com/token:rNzvHs1kbHCHqs9ydSEY7E2cUbfBdgbgqzJVOcG1';
let buff = Buffer.from(token);
let apiToken = buff.toString('base64');

const getForm = async (formId) => {
  return axios({
    method: 'GET',
    url: `${API_URL}/ticket_forms/${formId}`,
    headers: {
      Authorization: 'Basic ' + apiToken,
    },
  });
};

const getTicketField = async (fieldId) => {
  return axios({
    method: 'GET',
    url: `${API_URL}/ticket_fields/${fieldId}`,
    headers: {
      Authorization: 'Basic ' + apiToken,
    },
  });
};

export const main: APIGatewayProxyHandler = async (event, _context) => {
  const ticket_fields = {};
  const user = 'TestClientRm';
  const password = 'Pass@1234';

  const { data: form } = await getForm(FORM_ID);
  await Promise.all(
    form.ticket_form.ticket_field_ids.map(async (fieldId) => {
      const { data: ticketField } = await getTicketField(fieldId);
      ticket_fields[fieldId] = ticketField.ticket_field;
    })
  );

  const { data: session, status, statusText } = await axios({
    method: 'POST',
    url: `https://cdbeai.europ-assistance.in:82/api/getsession`,
    headers: {
      'x-auth-user': user,
      password: password,
    },
  });

  if (status == 200) {
    if (session.status == 'Failure') {
      throw session.message;
    } else {
      const response = await axios({
        method: 'POST',
        url: `https://cdbeai.europ-assistance.in:82/api/getCasesReportFromEzAuto`,
        headers: {
          'x-auth-user': user,
          password: password,
          'x-auth-token': session.message.sId,
        },
        data: {
          subregion: ['Telangana', 'West Bengal', 'Maharashtra'],
          client: 'ROENRSA',
          ServiceType: ['RRP', 'TOW'],
          LocationType: ['On Road', 'Home/Office'],
          timeLap: '60',
          ETAExceededReason: ['', 'Deferred'],
        },
      });

      if (response.status == 200) {
        await Promise.all(
          response.data.message.map(async (row) => {
            var getParams = {
              TableName: process.env.SYNC_HISTORY_TABLE,
              Key: {
                ServiceId: { S: row.ServiceId },
              },
            };
            const result = await dynamodb.getItem(getParams).promise();

            if (!result.Item) {
              const custom_fields = [];
              mapping.forEach((map) => {
                let value;

                if (typeof map.apiFieldKey == 'object') {
                  const data = map.apiFieldKey.map((field) => row[field]);
                  value = data.join(' ');
                } else if (typeof map.apiFieldKey == 'function') {
                  const ticket_field = ticket_fields[map.id];
                  value = map.apiFieldKey(row, ticket_field);
                } else {
                  value = row[map.apiFieldKey];
                  const ticket_field = ticket_fields[map.id];

                  if (ticket_field.type == 'integer') {
                    value = parseInt(value);
                  } else if (ticket_field.type == 'tagger' && value != undefined) {
                    const option = ticket_field.custom_field_options.find((option) => option.name.toUpperCase() == value.toUpperCase());
                    if (option) {
                      value = option.value;
                    }
                  }

                  custom_fields.push({
                    id: map.id,
                    value: value,
                  });
                }
              });

              const response = await axios({
                method: 'POST',
                url: `${API_URL}/tickets`,
                headers: {
                  Authorization: 'Basic ' + apiToken,
                },
                data: {
                  ticket: {
                    comment: {
                      body: `ServiceId: ${row.ServiceId}`,
                    },
                    subject: row.ServiceId,
                    ticket_form_id: FORM_ID,
                    custom_fields: custom_fields,
                  },
                },
              });

              if (response.status == 201) {
                const Item = {
                  ServiceId: {
                    S: row.ServiceId.toString(),
                  },
                  ticketId: {
                    N: response.data.ticket.id.toString(),
                  },
                  dateAdded: {
                    S: Date().toString(),
                  },
                };
                const putParams = {
                  TableName: process.env.SYNC_HISTORY_TABLE,
                  Item: Item,
                };
                await dynamodb.putItem(putParams).promise();
              }
            }
          })
        );

        await axios({
          method: 'POST',
          url: `https://cdbeai.europ-assistance.in:82/api/destroysession`,
          headers: {
            'x-auth-user': user,
            password: password,
            'x-auth-token': session.message.sId,
          },
        });
      }
    }
  } else {
    throw statusText;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'success' }),
  };
};
