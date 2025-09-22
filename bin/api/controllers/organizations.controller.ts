import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mondodb";
import {
  createErrorResponse,
  createGenericResponse,
  createSuccessResponse,
} from "../../common/utils";
import { config } from "dotenv";
import { generateTemporaryToken } from "../../common/cryptography/temporal";

config();

const REACH_DB = new MongoDB(process.env.DB_URI as string, "reachauth");

export async function create_organization(req: Request, res: Response) {
  const { name, description, supportEmail, supportWebsite, ownerId } = req.body;

  if (!name || !description || !supportEmail || !supportWebsite || !ownerId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
          400
        )
      );
  }

  const nameExistes = await REACH_DB.findDocuments("organizations", {
    name: name.toLowerCase(),
  });

  if (nameExistes.length > 0) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          false,
          null,
          "[REACH - Organizations]: Name already exists. Please use a different name or contact support.",
          400
        )
      );
  }

  const organizationPackage = {
    name: name.toLowerCase(),
    description,
    supportEmail,
    supportWebsite,
    ownerId,
    members: [ownerId],
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

export async function get_organization_info(req: Request, res: Response) {}

export async function create_organization_link(req: Request, res: Response) {
  try {
    const { organizationId, ownerId } = req.body;

    if (!organizationId || !ownerId) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH - Organizations]: Missing required fields. Please see the documentation for more information.",
            400
          )
        );
    }

    const organizationByOwner = await REACH_DB.findDocuments("organizations", {
      ownerId: ownerId,
    });

    if (organizationByOwner.length === 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH - Organizations]: Organizations by owner not found. Please contact support.",
            400
          )
        );
    }

    const organization = organizationByOwner.find(
      (org: any) => org._id.toString() === organizationId
    );

    const temporaryToken = await generateTemporaryToken(
      organization._id.toString()
    );

    const url = `${process.env.DASHBOARD_URL}/api/organizations/join?key=${temporaryToken}`;

    await REACH_DB.insertDocument("organizationLinks", {
      organizationId,
      ownerId,
      date: new Date(),
      expirationDate: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
      temporaryToken,
    });

    return res
      .status(200)
      .json(
        createSuccessResponse(url, "Organization link created successfully.")
      );
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(
        createErrorResponse(
          `[REACH - Organizations]: An error occurred while creating the organization link. ${error}`,
          500
        )
      );
  }
}

export async function get_organization_info_by_id(req: Request, res: Response) {
  const { organizationId, executor } = req.params;

  if (!organizationId || !executor) {
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
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Organizations]: Invalid executor type.",
          400
        )
      );
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

  if (organization[0].members.includes(userId)) {
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
    { $push: { members: userId } }
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
    members: { $elemMatch: { $eq: userId } },
  });

  if(organizations.length === 0) {
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

  const organizationWithNameUppercaseInAnyNewWord = organizationsWithoutMembers.map((org: any) => {
    return { ...org, name: org.name.replace(/\b\w/g, (char: string) => char.toUpperCase()) };
  })

  return res
    .status(200)
    .json(
      createSuccessResponse(
        organizationWithNameUppercaseInAnyNewWord,
        "Organizations retrieved successfully."
      )
    );
}