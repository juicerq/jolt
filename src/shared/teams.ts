import { type } from "arktype"
import { providerName } from "./providers"

const botFunction = type({
  "+": "reject",
  outcome: "string > 0",
  responsibilities: "string > 0",
  limits: "string > 0",
  delivery: "string > 0",
})

const leaderInput = type({
  "+": "reject",
  name: "string > 0",
  function: botFunction,
})

const leader = type({
  "+": "reject",
  id: "string > 0",
  name: "string > 0",
  role: type.enumerated("leader"),
  provider: providerName,
  function: botFunction,
  createdAt: "string > 0",
})

const member = type({
  "+": "reject",
  id: "string > 0",
  teamId: "string > 0",
  name: "string > 0",
  role: type.enumerated("member"),
  provider: providerName,
  function: botFunction,
  createdAt: "string > 0",
})

const team = type({
  "+": "reject",
  id: "string > 0",
  name: "string > 0",
  objective: "string > 0",
  defaultProvider: providerName,
  createdAt: "string > 0",
  leader,
  members: member.array(),
})

export const teamSchemas = {
  createInput: type({
    "+": "reject",
    name: "string > 0",
    objective: "string > 0",
    defaultProvider: providerName,
    leader: leaderInput,
  }),
  idInput: type({
    "+": "reject",
    id: "string > 0",
  }),
  createMemberInput: type({
    "+": "reject",
    teamId: "string > 0",
    name: "string > 0",
    "provider?": providerName,
    function: botFunction,
  }),
  member,
  team,
  teamList: team.array(),
}

export type CreateTeamInput = typeof teamSchemas.createInput.infer
export type Team = typeof teamSchemas.team.infer
export type Member = typeof teamSchemas.member.infer
