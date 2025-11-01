import { Request, Response } from "express";
import {
  createErrorResponse,
  createGenericResponse,
  createSuccessResponse,
} from "../../common/utils";
import { config } from "dotenv";
import { generateTemporaryToken } from "../../common/cryptography/temporal";
import { generateToken } from "../../common/reach/x-reach";
import { DateTime } from "luxon";
import { verifyTokenDate } from "../../common/reach/orgs.provider";
import { getReachAuthDB } from "../../common/services/database.service";
import { validateRequiredFields, validateRequest, isValidObjectId } from "../../common/services/validation.service";
import { ResponseHandler, asyncHandler } from "../../common/services/response.service";

config();

const REACH_DB = getReachAuthDB();

type OrganizationMemberEntry =
  | string
  | {
      userId: string;
      role: string;
    };

const normalizeMembers = (
  members: OrganizationMemberEntry[],
  ownerId: string
) =>
  members.map((member) =>
    typeof member === "string"
      ? { userId: member, role: member === ownerId ? "owner" : "member" }
      : member
  );

const memberMatchesUser = (member: OrganizationMemberEntry, userId: string) =>
  typeof member === "string" ? member === userId : member.userId === userId;

export async function create_organization(req: Request, res: Response) {
  const validation = validateRequiredFields(req.body, [
    "name",
    "description",
    "supportEmail",
    "supportWebsite",
    "ownerId"
  ]);
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { name, description, supportEmail, supportWebsite, ownerId } = req.body;

  const nameExistes = await REACH_DB.findDocuments("organizations", { name });

  if (nameExistes.length > 0) {
    return ResponseHandler.conflict(
      res,
      "Name already exists. Please use a different name or contact support."
    );
  }

  const organizationPackage = {
    name,
    description,
    supportEmail,
    supportWebsite,
    ownerId,
    members: [{ userId: ownerId, role: "owner" }],
    assets: {
      logo: null,
      banner: null,
    },
  };

  await REACH_DB.insertDocument("organizations", organizationPackage);

  return res
    .status(200)
    .json(
      createSuccessResponse(
        organizationPackage,
        "Organization created successfully."
      )
    );
}

export async function update_organization_assets(req: Request, res: Response) {
  const { organizationId } = req.body;
  const { logo, banner } = req.files as {
    [fieldname: string]: Express.Multer.File[];
  };
}

export async function create_organization_link(req: Request, res: Response) {
  try {
    const validation = validateRequest(req, {
      requiredBody: ["organizationId", "ownerId"],
      requiredHeaders: ["x-reach-token"]
    });
    
    if (!validation.isValid) {
      return ResponseHandler.validationError(res, validation.errors);
    }

    const { organizationId, ownerId } = req.body;
    const x_reach_token = req.headers["x-reach-token"] as string;

    const isValid = generateToken(ownerId) === x_reach_token;

    if (!isValid) {
      return ResponseHandler.forbidden(res, "Invalid header. Access denied.");
    }

    const organizationByOwner = await REACH_DB.findDocuments("organizations", {
      ownerId: ownerId,
    });

    if (organizationByOwner.length === 0) {
      return ResponseHandler.notFound(res, "Organization by owner");
    }

    const organization = organizationByOwner.find(
      (org: any) => org._id.toString() === organizationId
    );

    const temporaryToken = await generateTemporaryToken(
      organization._id.toString()
    );

    const url = `${process.env.DASHBOARD_URL}/api/organizations/join?key=${temporaryToken}`;

    const allNewPackage = {
      organizationId,
      ownerId,
      date: new Date(),
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
      temporaryToken,
    };

    await REACH_DB.insertDocument("organizationLinks", allNewPackage);

    return res.status(200).json(
      createSuccessResponse(
        {
          ...allNewPackage,
          url,
        },
        "Organization link created successfully."
      )
    );
  } catch (error) {
    console.log(error);
    return ResponseHandler.serverError(res, error as Error);
  }
}

export async function get_organization_info_by_id(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredParams: ["organizationId", "executor"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { organizationId, executor } = req.params;

  if (!isValidObjectId(organizationId)) {
    return ResponseHandler.badRequest(res, "Invalid organization ID format.");
  }

  const organization = await REACH_DB.findDocuments("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  let packet;

  if (executor === "invite") {
    packet = {
      name: organization[0].name,
      description: organization[0].description,
      supportEmail: organization[0].supportEmail,
    };
  } else if (executor === "dashboard") {
    packet = organization[0];
  } else {
    return ResponseHandler.badRequest(res, "Invalid executor type.");
  }

  return res
    .status(200)
    .json(
      createSuccessResponse(packet, "Organization retrieved successfully.")
    );
}

export async function get_organization_info_by_tk(req: Request, res: Response) {
  const { key } = req.params;

  if (!key) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const packageLink = await REACH_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Link not found or expired. Please generate a new link.",
          404
        )
      );
  }

  const organizationId = packageLink[0].organizationId;

  const organization = await REACH_DB.findDocuments("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Organization not found. Please check the ID and try again.",
          404
        )
      );
  }

  return res.status(200).json(
    createSuccessResponse(
      {
        name: organization[0].name,
        description: organization[0].description,
        supportEmail: organization[0].supportEmail,
        supportWebsite: organization[0].supportWebsite,
        ownerId: organization[0].ownerId,
      },
      "Organization retrieved successfully."
    )
  );
}

export async function join_organization(req: Request, res: Response) {
  const { key, userId } = req.body;

  if (!key || !userId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const packageLink = await REACH_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Link not found or expired. Please generate a new link.",
          404
        )
      );
  }

  const tokenDate = DateTime.fromISO(packageLink[0].createdAt);
  const isTokenValid = await verifyTokenDate(tokenDate);

  if (!isTokenValid) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Link has expired. Please request a new link.",
          400
        )
      );
  }

  const organizationId = packageLink[0].organizationId;

  const organization = await REACH_DB.findDocuments("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Organization not found. Please check the ID and try again.",
          404
        )
      );
  }

  const currentMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];

  if (currentMembers.some((member) => memberMatchesUser(member, userId))) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          false,
          null,
          "[REACH - Organizations]: User is already a member of the organization.",
          400
        )
      );
  }

  await REACH_DB.updateDocument(
    "organizations",
    { _id: REACH_DB.createObjectId(organizationId) },
    { $push: { members: { userId, role: "member" } } }
  );

  await REACH_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res
    .status(200)
    .json(
      createSuccessResponse(null, "User added to organization successfully.")
    );
}

export async function decline_invite(req: Request, res: Response) {
  const { key } = req.body;
  if (!key) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const packageLink = await REACH_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          true,
          null,
          "[REACH - Organizations]: Already declined or expired.",
          200
        )
      );
  }

  const tokenDate = DateTime.fromISO(packageLink[0].createdAt);
  const isTokenValid = await verifyTokenDate(tokenDate);

  if (!isTokenValid) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          true,
          null,
          "[REACH - Organizations]: Link has expired. Please request a new link.",
          200
        )
      );
  }

  await REACH_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res
    .status(200)
    .json(createSuccessResponse(null, "Invite declined successfully."));
}

export async function get_organizations_by_user(req: Request, res: Response) {
  const { userId } = req.params;

  if (!userId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const organizations = await REACH_DB.findDocuments("organizations", {
    $or: [
      { members: { $elemMatch: { userId: userId } } },
      { members: userId },
    ],
  });

  if (organizations.length === 0) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          true,
          null,
          "[REACH - Organizations]: No organizations found for this user.",
          404
        )
      );
  }

  const organizationsWithoutMembers = organizations.map((org: any) => {
    const { members, ownerId, ...rest } = org;
    return rest;
  });

  const organizationWithNameUppercaseInAnyNewWord =
    organizationsWithoutMembers.map((org: any) => {
      return {
        ...org,
        name: org.name.replace(/\b\w/g, (char: string) => char.toUpperCase()),
      };
    });

  return res
    .status(200)
    .json(
      createSuccessResponse(
        organizationWithNameUppercaseInAnyNewWord,
        "Organizations retrieved successfully."
      )
    );
}

export async function get_all_info_organization(req: Request, res: Response) {
  const { organizationId } = req.query;
  const x_reach_token = req.headers["x-reach-token"];

  if (!x_reach_token || x_reach_token.length === 0) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing header. Please provide a valid token.",
          400
        )
      );
  }

  if (
    !organizationId ||
    organizationId.length === 0 ||
    typeof organizationId !== "string"
  ) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const organization = await REACH_DB.findDocuments("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Organization not found. Please check the ID and try again.",
          404
        )
      );
  }

  const isValid = generateToken(organization[0].ownerId) === x_reach_token;

  if (!isValid) {
    return res
      .status(403)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Invalid X-Reach-Token. Access denied.",
          403
        )
      );
  }

  // create member list for fetching user data
  const existingMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];
  const normalizedMembers = normalizeMembers(
    existingMembers,
    organization[0].ownerId
  );

  const membersList = normalizedMembers.map((member) =>
    REACH_DB.findDocuments("user", {
      _id: REACH_DB.createObjectId(member.userId),
    })
  );

  const membersInfo = await Promise.all(membersList);

  // now, get all organization invites (expired and non-expired) for this organization
  const organizationInvites = await REACH_DB.findDocuments(
    "organizationLinks",
    { organizationId: organizationId }
  );

  // attach membersInfo and organizationInvites to organization object
  organization[0].members = normalizedMembers;
  organization[0].membersInfo = membersInfo
    .map((memberArray, index) => {
      const memberDocument = memberArray[0];
      if (!memberDocument) {
        return null;
      }

      return {
        ...memberDocument,
        role: normalizedMembers[index]?.role ?? "member",
      };
    })
    .filter((member): member is Record<string, unknown> => member !== null);
  organization[0].organizationInvites = organizationInvites;

  // finally, return the organization object with all info
  return res
    .status(200)
    .json(
      createSuccessResponse(
        organization[0],
        "Organization retrieved successfully."
      )
    );
}

export async function renew_organization_link(req: Request, res: Response) {
  const { key } = req.body;

  if (!key) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const packageLink = await REACH_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Link not found. Please generate a new link.",
          404
        )
      );
  }

  const { organizationId } = packageLink[0];

  const newTemporaryToken = await generateTemporaryToken(
    organizationId.toString()
  );

  await REACH_DB.updateDocument(
    "organizationLinks",
    { temporaryToken: key as string },
    {
      $set: {
        temporaryToken: newTemporaryToken,
        date: new Date(),
        expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
      },
    }
  );

  //resolve all new package to update in FRONTEND
  res.status(200).json(
    createSuccessResponse(
      {
        temporaryToken: newTemporaryToken,
        previousToken: key,
        newExpirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
      },
      "Organization link renewed successfully."
    )
  );
}

export async function revoke_organization_link(req: Request, res: Response) {
  const { key } = req.body;

  if (!key) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const packageLink = await REACH_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Link not found. Please generate a new link.",
          404
        )
      );
  }

  await REACH_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res
    .status(200)
    .json(
      createSuccessResponse(null, "Organization link revoked successfully.")
    );
}

export async function delete_member_from_organization(
  req: Request,
  res: Response
) {
  const { organizationId, memberId } = req.body;
  if (!organizationId || !memberId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }
  const organization = await REACH_DB.findDocuments("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Organization not found. Please check the ID and try again.",
          404
        )
      );
  }

  const currentMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];

  if (!currentMembers.some((member) => memberMatchesUser(member, memberId))) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Member not found in organization.",
          400
        )
      );
  }

  await REACH_DB.updateDocument(
    "organizations",
    { _id: REACH_DB.createObjectId(organizationId) },
    { $pull: { members: { userId: memberId } } }
  );

  await REACH_DB.updateDocument(
    "organizations",
    { _id: REACH_DB.createObjectId(organizationId) },
    { $pull: { members: memberId } }
  );

  return res
    .status(200)
    .json(
      createSuccessResponse(
        null,
        "Member removed from organization successfully."
      )
    );
}

export async function edit_organization_info(req: Request, res: Response) {
  const { organizationId, description, supportEmail, supportWebsite } = req.body;

  const validation = validateRequiredFields(req.body, [
    "organizationId",
    "description",
    "supportEmail",
    "supportWebsite",
  ]);
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  await REACH_DB.updateDocument("organizations", {
    _id: REACH_DB.createObjectId(organizationId),
  }, {
    $set: {
      description,
      supportEmail,
      supportWebsite,
    },
  });

  return res
    .status(200)
    .json(
      createSuccessResponse(null, "Organization information updated successfully.")
    );
}
