export type InputNode = Record<string, string | boolean | number>;
export type ArrayNode = Record<string, string[] | boolean[] | number[]>;
export type LikeNode = Record<string, string>;
export type NullNode = Record<string, boolean>;
export type OrderNode = Record<string, number>;

// https://docs.mongodb.com/manual/reference/operator/

export interface Expression {
    if?: InputNode;
    eq?: InputNode;
    gt?: InputNode;
    gte?: InputNode;
    lt?: InputNode;
    lte?: InputNode;
    ne?: InputNode;
    like?: LikeNode;
    nlike?: LikeNode;
    rlike?: LikeNode;
    in?: ArrayNode;
    nin?: ArrayNode;
    nil?: NullNode;
    not?: Expression;
    nor?: Expression;
    and?: Expression[];
    or?: Expression[];
}

export interface ToolkitQuery extends Expression {
    order?: OrderNode;
    where?: string;
    offset?: number;
    limit?: number;
    exists?: boolean;
    skip?: number;
    take?: number;
}

export type ToolkitArgs = any;

const ES = "`";

export namespace ToolkitQuery {
    export const ALIAS = "target";

    export function prepareSql(keys: ToolkitArgs, query: ToolkitQuery) {
        let params: Record<string, any> = {};
        if (keys) Object.assign(params, keys);
        let { where, orex } = prepareWhere(query, true, params, { count: 0 });
        let pki = 0;
        let pql = "";
        if (keys) Object.keys(keys).forEach(key => {
            if (pki) pql += " AND ";
            pql += `${ALIAS}.${ES}${key}${ES} = :${key}`;
            pki++;
        });
        let order: { column: string, asc: boolean }[] = [];
        if (query.order) {
            order = Object.entries(query.order)
                .sort((a, b) => Math.abs(a[1]) - Math.abs(a[1]))
                .map(e => ({ column: `${ALIAS}.${ES}${e[0]}${ES}`, asc: e[1] >= 0 }));
        }
        where = pql + (pql && where ? ` ${orex ? "OR" : "AND"} ${where}` : where);
        return { where, params, order, skip: query.skip, take: query.take };
    }

    export function prepareWhere(node: Expression, and: boolean, params: ToolkitArgs, index: { count: number }): {
        where: string,
        orex: boolean
    } {
        if (!node) return { where: "", orex: false };
        index.count++;

        let sql = "";
        let count = 0;
        let orex = false;

        operator(node.if, "=");
        operator(node.eq, "=");
        operator(node.ne, "<>");
        operator(node.gt, ">");
        operator(node.gte, ">=");
        operator(node.lt, "<");
        operator(node.lte, "<=");
        operator(node.like, "LIKE");
        operator(node.rlike, "RLIKE");
        operator(node.nlike, "NOT LIKE");
        operator(node.in, "IN");
        operator(node.nin, "NOT IN");
        operator(node.nil, "NULL");

        if (node.and && node.and.length) {
            let seg = "";
            for (let item of node.and) {
                let { where } = prepareWhere(item, true, params, index);
                if (seg) seg += " AND ";
                seg += where;
            }
            if (count) sql += and ? " AND " : " OR ";
            sql += seg;
            count++;
        }
        if (node.not) {
            let { where } = prepareWhere(node.not, true, params, index);
            if (count) sql += and ? " AND " : " OR ";
            sql += "NOT " + where;
            count++;
        }
        if (node.nor) {
            if (count === 0 && !node.or) orex = true;
            let { where } = prepareWhere(node.nor, false, params, index);
            if (count) sql += and ? " AND " : " OR ";
            sql += "NOT " + where;
            count++;
        }
        if (node.or && node.or.length) {
            if (count === 0 && !node.nor) orex = true;
            let seg = "";
            for (let item of node.or) {
                let { where } = prepareWhere(item, false, params, index);
                if (seg) seg += " OR ";
                seg += where;
            }
            if (count) sql += and ? " AND " : " OR ";
            sql += "(" + seg + ")";
            count++;
        }

        sql += "";
        return { where: count ? sql : "", orex };

        function operator(inp: InputNode | LikeNode | ArrayNode, oper: string) {
            if (!inp) return null;
            let part = "(";
            let i = 0;
            for (let key in inp) {
                if (i) part += ` ${and ? "AND" : "OR"} `;
                let param = `${key}_${index.count}_${i}`;
                part += `${ALIAS}.${ES}${key}${ES} `;
                if (oper === "IN" || oper === "NOT IN") {
                    part += `${oper} (:${param})`;
                } else if (oper === "NULL") {
                    part += `IS ${inp[key] ? "NULL" : "NOT NULL"}`;
                } else {
                    part += `${oper} :${param}`;
                }
                params[param] = inp[key] as any;
                i++;
            }
            part += ")";
            if (i) {
                if (count) sql += and ? " AND " : " OR ";
                sql += part;
                count++;
            }
        }
    }
}